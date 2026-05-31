import OpenAI from 'openai';

export class CritiqueError extends Error {}

const GPT_MODEL = 'gpt-5-5-thinking';

const effort = (): string => process.env.SHARPEN_GPT_EFFORT ?? 'high';

const CRITIC_SYSTEM = `You are a prompt-engineering critic. You will be shown a study prompt that another AI wrote for a Pomfret School student, plus the student's situation. List concrete, specific weaknesses in the prompt and exactly what would make it sharper — name actual gaps (missing constraints, vague instructions, weak self-test design, format issues), not generic advice. Be terse and specific. Do NOT rewrite the prompt; only critique it.`;

let client: OpenAI | null = null;
function getClient(): OpenAI {
  // The OpenAI SDK ships as a class at runtime, but tests may mock it with an
  // arrow function (which JS does not permit invoking with `new`). Try `new`
  // first and fall back to a plain call so both paths work — mirrors makeClient
  // in shared's opus-full-prompt.ts.
  if (!client) {
    const opts = { apiKey: process.env.OPENAI_API_KEY };
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
      model: GPT_MODEL,
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
