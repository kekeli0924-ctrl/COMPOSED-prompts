import { createHash } from 'node:crypto';
import type { WizardInputs, GenerateResponse } from '@/lib/types';
import { assembleDeterministicPrompt } from '@/lib/generation/assembler';
import { generateInteractionStyle } from '@/lib/generation/interaction-style';
import { budgetAvailable, recordSpend } from '@/lib/budget/daily-cap';

const SONNET_INPUT_PER_MTOK_USD = 3.0;
const SONNET_OUTPUT_PER_MTOK_USD = 15.0;

const estimateSpendUsd = (usage: { input_tokens: number; output_tokens: number }): number => {
  return (
    (usage.input_tokens / 1_000_000) * SONNET_INPUT_PER_MTOK_USD +
    (usage.output_tokens / 1_000_000) * SONNET_OUTPUT_PER_MTOK_USD
  );
};

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

export async function runPipeline(inputs: WizardInputs): Promise<GenerateResponse> {
  const budgetOk = await budgetAvailable();
  let interactionOverride: string | undefined;
  let sonnetUsed = false;
  let fallbackReason: GenerateResponse['metadata']['fallbackReason'];

  if (budgetOk) {
    const result = await generateInteractionStyle(inputs);
    if (result.ok) {
      interactionOverride = result.text;
      sonnetUsed = true;
      await recordSpend(estimateSpendUsd(result.usage));
    } else {
      fallbackReason = 'api-error';
    }
  } else {
    fallbackReason = 'budget-exhausted';
  }

  const prompt = assembleDeterministicPrompt(inputs, { interactionStyleOverride: interactionOverride });
  return {
    prompt,
    metadata: {
      sonnetUsed,
      promptHash: sha256(prompt),
      ...(fallbackReason ? { fallbackReason } : {}),
    },
  };
}
