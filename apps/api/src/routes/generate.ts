import { Hono } from 'hono';
import {
  WizardInputsSchema,
  redactMaterialForHistory,
  gradeFromGradYear,
  type GenerateResponse,
  type RateLimitedResponse,
} from '@composed-prompts/shared';
import { runPipeline } from '../lib/pipeline.js';
import { checkAndRecord } from '../lib/rate-limit.js';
import { hashIp } from '../lib/ip-hash.js';
import { getIp } from '../lib/get-ip.js';
import { db, schema } from '../lib/db.js';

export const generate = new Hono();

const RATE_LIMIT_PER_IP_PER_DAY = parseInt(process.env.RATE_LIMIT_PER_IP_PER_DAY ?? '20', 10);
const RATE_LIMIT_PER_USER_PER_DAY = parseInt(process.env.RATE_LIMIT_PER_USER_PER_DAY ?? '100', 10);

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

  const authedUser = c.get('user');
  const ip = getIp(c);
  const rlBucket = authedUser ? `user:${authedUser.id}` : `ip:${hashIp(ip)}`;
  const rlLimit = authedUser ? RATE_LIMIT_PER_USER_PER_DAY : RATE_LIMIT_PER_IP_PER_DAY;
  const limit = await checkAndRecord(rlBucket, { limit: rlLimit, windowSeconds: 24 * 60 * 60 });
  if (!limit.allowed) {
    // scope lets the web client show a shared-IP message ("sign in for your own limit")
    // vs a personal daily-limit message. No limit values or IPs leave the API.
    return c.json({ error: 'rate_limited', scope: authedUser ? 'user' : 'ip' } satisfies RateLimitedResponse, 429);
  }

  try {
    const userId = authedUser?.id ?? null;
    const studentGrade = gradeFromGradYear(authedUser?.gradYear ?? null) ?? undefined;
    const result = await runPipeline(inputs, { userId, studentGrade });

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
        templateVersion: result.templateVersion,
        usedRecapId: result.usedRecap?.id ?? null,
        assessmentDate: inputs.assessmentDate, // queryable copy for the outcome check-in
      })
      .returning({ id: schema.generations.id });

    const response: GenerateResponse = {
      prompt: result.prompt,
      metadata: {
        promptHash: result.promptHash,
        generator: result.generator,
        generationId: inserted!.id,
        templateVersion: result.templateVersion,
        ...(result.usedRecap ? { usedRecap: result.usedRecap } : {}),
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
