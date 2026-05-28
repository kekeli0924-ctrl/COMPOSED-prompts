import { createHash, randomUUID } from 'node:crypto';
import type { WizardInputs, GenerateResponse } from '@composed-prompts/shared';
import { assembleDeterministicPrompt } from '@composed-prompts/shared';
import { generateFullPromptWithOpus } from '@composed-prompts/shared/src/generation/opus-full-prompt';
import { budgetAvailable, recordSpend } from '@/lib/budget/daily-cap';

const OPUS_INPUT_PER_MTOK_USD = 5.0;
const OPUS_OUTPUT_PER_MTOK_USD = 25.0;

const estimateOpusSpendUsd = (usage: { input_tokens: number; output_tokens: number }): number => {
  return (
    (usage.input_tokens / 1_000_000) * OPUS_INPUT_PER_MTOK_USD +
    (usage.output_tokens / 1_000_000) * OPUS_OUTPUT_PER_MTOK_USD
  );
};

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

export async function runPipeline(inputs: WizardInputs): Promise<GenerateResponse> {
  const budgetOk = await budgetAvailable();
  let fallbackReason: GenerateResponse['metadata']['fallbackReason'];
  const generationId = randomUUID();

  if (budgetOk) {
    const opusResult = await generateFullPromptWithOpus(inputs);
    if (opusResult.ok) {
      await recordSpend(estimateOpusSpendUsd(opusResult.usage));
      return {
        prompt: opusResult.prompt,
        metadata: {
          promptHash: sha256(opusResult.prompt),
          generator: 'opus',
          generationId,
        },
      };
    }
    fallbackReason = 'api-error';
  } else {
    fallbackReason = 'budget-exhausted';
  }

  const prompt = assembleDeterministicPrompt(inputs);
  return {
    prompt,
    metadata: {
      promptHash: sha256(prompt),
      generator: 'deterministic',
      fallbackReason,
      generationId,
    },
  };
}
