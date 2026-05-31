import type { WizardInputs } from '../types.js';
import { getModelProfile } from '../model-profiles.js';
import { makeClient, OPUS_MODEL, type OpusFullPromptResult } from './opus-full-prompt.js';

const REVISE_SYSTEM_PROMPT = `You are a prompt engineer improving a study prompt for a Pomfret School student. You will be given (1) a study prompt you previously wrote, and (2) an external critique of it from another model. Produce an IMPROVED version of the prompt that:
- Fixes the valid, specific points in the critique (ignore vague or wrong ones).
- Keeps the same 7-section Pomfret-Study framework and the SAME output format the student's LLM wants (XML tags / markdown headers / numbered steps — match whatever the original used).
- Stays a clean, copy-paste-ready prompt written in the student's first person.
Output ONLY the improved prompt — no preamble, no "here is", no commentary about the changes.`;

const ALLOWED_EFFORTS = ['low', 'medium', 'high', 'xhigh', 'max'];
// claude-opus-4-8 controls thinking via `thinking.type: 'adaptive'` + `output_config.effort`.
// The older `thinking.type: 'enabled'` + `budget_tokens` shape is rejected by this model
// (400 invalid_request_error). Default 'medium' balances revise quality against staying
// inside the request timeout; invalid values fail safe to 'medium'.
const reviseEffort = (): string => {
  const v = process.env.SHARPEN_OPUS_EFFORT ?? 'medium';
  return ALLOWED_EFFORTS.includes(v) ? v : 'medium';
};

export async function revisePromptWithOpus(
  basePrompt: string,
  critique: string,
  inputs: WizardInputs,
  studentGrade?: string,
): Promise<OpusFullPromptResult> {
  const profile = getModelProfile(inputs.provider, inputs.model);
  const userMessage = [
    studentGrade ? `Student's grade: ${studentGrade}.` : '',
    `The student's LLM expects: ${profile.format} format. Keep that format.`,
    '',
    'YOUR ORIGINAL PROMPT:',
    '---',
    basePrompt,
    '---',
    '',
    'EXTERNAL CRITIQUE:',
    '---',
    critique,
    '---',
    '',
    'Now output the improved prompt only.',
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n');

  const client = makeClient();
  try {
    const response = await client.messages.create({
      model: OPUS_MODEL,
      max_tokens: 16000, // generous ceiling: covers adaptive thinking + the revised prompt
      thinking: { type: 'adaptive' },
      output_config: { effort: reviseEffort() },
      system: REVISE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    } as Parameters<typeof client.messages.create>[0]);
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text' || typeof block.text !== 'string') {
      return { ok: false, error: 'api-error' };
    }
    return {
      ok: true,
      prompt: block.text.trim(),
      usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
    };
  } catch (err) {
    console.error('[revise-prompt] Anthropic call failed', { message: err instanceof Error ? err.message : String(err) });
    return { ok: false, error: 'api-error' };
  }
}
