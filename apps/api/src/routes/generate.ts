import { Hono } from 'hono';
import {
  WizardInputsSchema,
  redactMaterialForHistory,
  type GenerateResponse,
} from '@composed-prompts/shared';
import { runPipeline } from '../lib/pipeline.js';
import { checkAndRecord } from '../lib/rate-limit.js';
import { hashIp } from '../lib/ip-hash.js';
import { db, schema } from '../lib/db.js';

export const generate = new Hono();

const RATE_LIMIT_PER_IP_PER_DAY = parseInt(process.env.RATE_LIMIT_PER_IP_PER_DAY ?? '20', 10);

const getIp = (c: { req: { header: (k: string) => string | undefined } }): string => {
  const fwd = c.req.header('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return c.req.header('x-real-ip') ?? 'unknown';
};

const redactInputsForStorage = (inputs: Record<string, unknown>): Record<string, unknown> => ({
  ...inputs,
  material: inputs.material ? '[redacted]' : undefined,
  understanding: inputs.understanding ? '[redacted]' : undefined,
  confusion: inputs.confusion ? '[redacted]' : undefined,
});

generate.post('/api/generate', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON' }, 400);
  }

  const parsed = WizardInputsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid input', issues: parsed.error.issues.map((i) => ({ path: i.path.map(String), message: i.message })) }, 400);
  }
  const inputs = parsed.data;

  const ip = getIp(c);
  const limit = await checkAndRecord(`ip:${hashIp(ip)}`, { limit: RATE_LIMIT_PER_IP_PER_DAY, windowSeconds: 24 * 60 * 60 });
  if (!limit.allowed) {
    return c.json({ error: 'rate limit exceeded; try again tomorrow' }, 429);
  }

  try {
    const userId = c.get('user')?.id ?? null;
    const result = await runPipeline(inputs, { userId });

    const scrubbedPrompt = redactMaterialForHistory(result.prompt);
    const [inserted] = await db
      .insert(schema.generations)
      .values({
        ipHash: hashIp(ip),
        userId,
        inputsJson: redactInputsForStorage(inputs as unknown as Record<string, unknown>),
        promptText: scrubbedPrompt,
        promptHash: result.promptHash,
        generator: result.generator,
        courseId: inputs.courseId,
        mode: inputs.mode,
        provider: inputs.provider,
        model: inputs.model,
        fallbackReason: result.fallbackReason ?? null,
      })
      .returning({ id: schema.generations.id });

    const response: GenerateResponse = {
      prompt: result.prompt,
      metadata: {
        promptHash: result.promptHash,
        generator: result.generator,
        generationId: inserted!.id,
        ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
      },
    };
    return c.json(response, 200);
  } catch (err) {
    console.error('generate failed', {
      message: err instanceof Error ? err.message : 'unknown',
      input: redactInputsForStorage(inputs as unknown as Record<string, unknown>),
    });
    return c.json({ error: 'internal error' }, 500);
  }
});
