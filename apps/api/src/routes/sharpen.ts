import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import {
  findCourse,
  gradeFromGradYear,
  redactMaterialForHistory,
  type WizardInputs,
  type SharpenResponse,
} from '@composed-prompts/shared';
// Node-only modules are imported via deep paths (the browser-safe barrel excludes them),
// which also lets the route test mock them — mirrors how pipeline.ts imports these.
import { revisePromptWithOpus } from '@composed-prompts/shared/src/generation/revise-prompt.js';
import { promptHash } from '@composed-prompts/shared/src/storage/prompt-hash.js';
import { critiquePromptWithGpt, CritiqueError } from '../lib/openai.js';
import { budgetAvailable, recordSpend } from '../lib/budget.js';
import { checkAndRecord } from '../lib/rate-limit.js';
import { reserveGlobalOpusSlot } from '../lib/pipeline.js';
import { db, schema } from '../lib/db.js';

export const sharpen = new Hono();

const PER_USER = parseInt(process.env.SHARPEN_PER_USER_PER_DAY ?? '10', 10);
const SPEND = parseFloat(process.env.SHARPEN_SPEND_ESTIMATE_USD ?? '0.20');
const MAX_PROMPT = 20000;

sharpen.post('/api/generate/sharpen', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  let body: { generationId?: unknown; basePrompt?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON' }, 400);
  }
  const generationId = typeof body.generationId === 'string' ? body.generationId : '';
  const basePrompt = typeof body.basePrompt === 'string' ? body.basePrompt : '';
  if (!generationId || !basePrompt) return c.json({ error: 'missing fields' }, 400);
  if (basePrompt.length > MAX_PROMPT) return c.json({ error: 'prompt too long' }, 400);

  const rl = await checkAndRecord(`sharpen:user:${user.id}`, { limit: PER_USER, windowSeconds: 86400 });
  if (!rl.allowed) return c.json({ error: 'daily sharpen limit reached' }, 429);

  // Cost gate: dollar budget (fails closed) + the global Opus slot (revise is an Opus call).
  if (!(await budgetAvailable()) || !reserveGlobalOpusSlot()) {
    return c.json({ ok: false, reason: 'unavailable' } satisfies SharpenResponse, 200);
  }

  const [row] = await db.select().from(schema.generations).where(eq(schema.generations.id, generationId));
  if (!row) return c.json({ ok: false, reason: 'unavailable' } satisfies SharpenResponse, 200);
  const inputs = row.inputsJson as unknown as WizardInputs;
  const courseLabel = (inputs.courseId ? findCourse(inputs.courseId)?.name : inputs.courseFreeText) ?? 'their course';
  const grade = gradeFromGradYear(user.gradYear ?? null) ?? undefined;

  let critique: string;
  try {
    critique = await critiquePromptWithGpt(basePrompt, { courseLabel, mode: inputs.mode, assessmentType: inputs.assessmentType });
  } catch (err) {
    if (err instanceof CritiqueError) return c.json({ ok: false, reason: 'critic-failed' } satisfies SharpenResponse, 200);
    console.error('sharpen critic failed', { message: err instanceof Error ? err.message : String(err) });
    return c.json({ ok: false, reason: 'critic-failed' } satisfies SharpenResponse, 200);
  }

  const revised = await revisePromptWithOpus(basePrompt, critique, inputs, grade);
  if (!revised.ok) return c.json({ ok: false, reason: 'revise-failed' } satisfies SharpenResponse, 200);

  await recordSpend(SPEND);
  await db.insert(schema.generations).values({
    userId: user.id,
    inputsJson: inputs as unknown as Record<string, unknown>, // already redacted (loaded from storage)
    promptText: redactMaterialForHistory(revised.prompt),
    promptHash: promptHash(revised.prompt),
    generator: 'opus',
    courseId: row.courseId,
    mode: row.mode,
    provider: row.provider,
    model: row.model,
  });

  return c.json({ ok: true, improvedPrompt: revised.prompt, critique } satisfies SharpenResponse, 200);
});
