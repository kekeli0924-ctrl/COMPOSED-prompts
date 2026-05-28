import {
  type WizardInputs,
  assembleDeterministicPrompt,
} from '@composed-prompts/shared';
import { generateFullPromptWithOpus } from '@composed-prompts/shared/src/generation/opus-full-prompt';
import { promptHash } from '@composed-prompts/shared/src/storage/prompt-hash';
import { budgetAvailable, recordSpend } from './budget.js';

const OPUS_INPUT_USD_PER_MTOK = 5.0;
const OPUS_OUTPUT_USD_PER_MTOK = 25.0;

const estimateOpusSpendUsd = (usage: { input_tokens: number; output_tokens: number }): number =>
  (usage.input_tokens / 1_000_000) * OPUS_INPUT_USD_PER_MTOK +
  (usage.output_tokens / 1_000_000) * OPUS_OUTPUT_USD_PER_MTOK;

export type PipelineResult = {
  prompt: string;
  promptHash: string;
  generator: 'opus' | 'deterministic';
  fallbackReason?: 'budget-exhausted' | 'api-error';
};

export async function runPipeline(inputs: WizardInputs): Promise<PipelineResult> {
  const budgetOk = await budgetAvailable();
  let fallbackReason: PipelineResult['fallbackReason'];

  if (budgetOk) {
    const result = await generateFullPromptWithOpus(inputs);
    if (result.ok) {
      await recordSpend(estimateOpusSpendUsd(result.usage));
      return {
        prompt: result.prompt,
        promptHash: promptHash(result.prompt),
        generator: 'opus',
      };
    }
    fallbackReason = 'api-error';
  } else {
    fallbackReason = 'budget-exhausted';
  }

  const prompt = assembleDeterministicPrompt(inputs);
  return {
    prompt,
    promptHash: promptHash(prompt),
    generator: 'deterministic',
    fallbackReason,
  };
}
