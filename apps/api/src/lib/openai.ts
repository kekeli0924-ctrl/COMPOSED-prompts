import OpenAI from 'openai';

export class CritiqueError extends Error {}

// Env-overridable so the model can be swapped/upgraded via a Fly secret with no code
// change — the account must actually have access to it. Default 'gpt-5.5' is the flagship
// reasoning model. (The prior 'gpt-5-5-thinking' was not a real model id → model_not_found.)
const model = (): string => process.env.SHARPEN_GPT_MODEL ?? 'gpt-5.5';

const ALLOWED_EFFORTS = ['minimal', 'low', 'medium', 'high', 'xhigh'];
// Default 'low': a prompt critique is not a hard reasoning task, and high effort on a
// flagship reasoning model routinely runs past the request timeout. Operators can raise
// it via SHARPEN_GPT_EFFORT; an invalid value fails safe to 'low'.
const effort = (): string => {
  const v = process.env.SHARPEN_GPT_EFFORT ?? 'low';
  return ALLOWED_EFFORTS.includes(v) ? v : 'low';
};

const CRITIC_SYSTEM = `You are a prompt-engineering critic. You will be shown a study prompt that another AI wrote for a Pomfret School student, plus the student's situation. List concrete, specific weaknesses in the prompt and exactly what would make it sharper — name actual gaps (missing constraints, vague instructions, weak self-test design, format issues), not generic advice. Be terse and specific. Do NOT rewrite the prompt; only critique it.`;

let client: OpenAI | null = null;
function getClient(): OpenAI {
  // The OpenAI SDK ships as a class at runtime, but tests may mock it with an
  // arrow function (which JS does not permit invoking with `new`). Try `new`
  // first and fall back to a plain call so both paths work — mirrors makeClient
  // in shared's opus-full-prompt.ts.
  if (!client) {
    // 120s: a reasoning-model critique can take well over the SDK's 30s default. maxRetries 0
    // because retrying a slow reasoning call just compounds latency past the request budget.
    const opts = { apiKey: process.env.OPENAI_API_KEY, maxRetries: 0, timeout: parseInt(process.env.SHARPEN_GPT_TIMEOUT_MS ?? '120000', 10) };
    try {
      client = new (OpenAI as unknown as new (o: typeof opts) => OpenAI)(opts);
    } catch {
      const Callable = OpenAI as unknown as (o: typeof opts) => OpenAI;
      client = Callable(opts);
    }
  }
  return client;
}

export async function critiquePromptWithGpt(
  basePrompt: string,
  context: { courseLabel: string; mode: string; assessmentType: string },
): Promise<string> {
  // Fail legibly if the key is unset (the OpenAI SDK constructor throws on a
  // missing key; surface a clear message the route turns into a graceful
  // {ok:false,reason:'critic-failed'} instead of an opaque constructor error).
  if (!process.env.OPENAI_API_KEY) throw new CritiqueError('OPENAI_API_KEY not configured');
  const user = [
    `Student situation: ${context.courseLabel}, study mode "${context.mode}", preparing for a ${context.assessmentType}.`,
    '',
    'The prompt to critique:',
    '---',
    basePrompt,
    '---',
  ].join('\n');
  try {
    const res = await getClient().chat.completions.create({
      model: model(),
      reasoning_effort: effort(),
      messages: [
        { role: 'system', content: CRITIC_SYSTEM },
        { role: 'user', content: user },
      ],
    } as Parameters<OpenAI['chat']['completions']['create']>[0]);
    const text = (res as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string') throw new CritiqueError('empty critique');
    return text;
  } catch (err) {
    if (err instanceof CritiqueError) throw err;
    throw new CritiqueError(err instanceof Error ? err.message : String(err));
  }
}
