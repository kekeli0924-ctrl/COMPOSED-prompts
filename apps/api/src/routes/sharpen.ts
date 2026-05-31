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
import { critiquePromptWithGpt } from '../lib/openai.js';
import { budgetAvailable, recordSpend } from '../lib/budget.js';
import { checkAndRecord } from '../lib/rate-limit.js';
import { reserveGlobalOpusSlot } from '../lib/pipeline.js';
import { db, schema } from '../lib/db.js';

export const sharpen = new Hono();

const PER_USER = parseInt(process.env.SHARPEN_PER_USER_PER_DAY ?? '10', 10);
// Conservative flat spend estimates — a maxed critique + revise really costs ~$0.40-0.65,
// so over-counting keeps the daily dollar budget protective. The GPT half is recorded once
// the critique succeeds (independent of the revise outcome) so a revise outage can't burn
// unrecorded GPT spend.
const GPT_SPEND = parseFloat(process.env.SHARPEN_GPT_SPEND_USD ?? '0.30');
const OPUS_SPEND = parseFloat(process.env.SHARPEN_OPUS_SPEND_USD ?? '0.35');
const GLOBAL_OPUS_CAP = (): number => {
  const n = parseInt(process.env.GLOBAL_OPUS_CALLS_PER_DAY ?? '250', 10);
  return Number.isFinite(n) && n > 0 ? n : 250;
};
const utcDay = (): string => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};
const MAX_PROMPT = 40000;

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
  if (!rl.allowed) {
    console.log('[sharpen] blocked: per-user daily cap reached', { userId: user.id, limit: PER_USER });
    return c.json({ error: 'daily sharpen limit reached' }, 429);
  }

  // Cost gate: dollar budget (fails closed) + the in-memory backstop + the DB-backed global
  // Opus cap (same `global:opus:<day>` bucket + ceiling as the base generate flow, so the two
  // are jointly bounded and the cap survives a process restart). The revise is an Opus call.
  if (!(await budgetAvailable()) || !reserveGlobalOpusSlot()) {
    console.log('[sharpen] blocked: budget unavailable or in-memory opus slot exhausted');
    return c.json({ ok: false, reason: 'unavailable' } satisfies SharpenResponse, 200);
  }
  const globalCap = await checkAndRecord(`global:opus:${utcDay()}`, { limit: GLOBAL_OPUS_CAP(), windowSeconds: 86400, failClosed: true });
  if (!globalCap.allowed) {
    console.log('[sharpen] blocked: global opus daily cap reached');
    return c.json({ ok: false, reason: 'unavailable' } satisfies SharpenResponse, 200);
  }

  // Looked up only for redacted critique context (course/mode/assessment) + non-sensitive
  // metadata copied into the caller's OWN new row; nothing from it is returned to the caller,
  // so this is intentionally NOT ownership-scoped (low-harm).
  const [row] = await db.select().from(schema.generations).where(eq(schema.generations.id, generationId));
  if (!row) {
    console.log('[sharpen] blocked: generation row not found', { generationId });
    return c.json({ ok: false, reason: 'unavailable' } satisfies SharpenResponse, 200);
  }
  const inputs = row.inputsJson as unknown as WizardInputs;
  const courseLabel = (inputs.courseId ? findCourse(inputs.courseId)?.name : inputs.courseFreeText) ?? 'their course';
  const grade = gradeFromGradYear(user.gradYear ?? null) ?? undefined;

  let critique: string;
  try {
    critique = await critiquePromptWithGpt(basePrompt, { courseLabel, mode: inputs.mode, assessmentType: inputs.assessmentType });
  } catch (err) {
    // Log the underlying message — a CritiqueError carries the real OpenAI error
    // (e.g. model_not_found / insufficient_quota), so production failures stay
    // diagnosable. The caller still gets only the generic graceful reason.
    console.error('sharpen critic failed', { message: err instanceof Error ? err.message : String(err) });
    return c.json({ ok: false, reason: 'critic-failed' } satisfies SharpenResponse, 200);
  }

  await recordSpend(GPT_SPEND); // GPT money is spent now — record it regardless of the revise outcome.

  const revised = await revisePromptWithOpus(basePrompt, critique, inputs, grade);
  if (!revised.ok) {
    console.error('[sharpen] revise failed', { detail: (revised as { error?: unknown }).error });
    return c.json({ ok: false, reason: 'revise-failed' } satisfies SharpenResponse, 200);
  }

  await recordSpend(OPUS_SPEND);
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

  console.log('[sharpen] ok', { userId: user.id });
  return c.json({ ok: true, improvedPrompt: revised.prompt, critique } satisfies SharpenResponse, 200);
});
