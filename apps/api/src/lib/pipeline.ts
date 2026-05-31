import {
  type WizardInputs,
  assembleDeterministicPrompt,
} from '@composed-prompts/shared';
import { generateFullPromptWithOpus } from '@composed-prompts/shared/src/generation/opus-full-prompt.js';
import { promptHash } from '@composed-prompts/shared/src/storage/prompt-hash.js';
import { budgetAvailable, recordSpend } from './budget.js';
import { checkAndRecord } from './rate-limit.js';
import { fetchRagContext, buildRagContext } from './rag.js';

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

const globalOpusCap = (): number => {
  const n = parseInt(process.env.GLOBAL_OPUS_CALLS_PER_DAY ?? '250', 10);
  return Number.isFinite(n) && n > 0 ? n : 250;
};

const utcDay = (): string => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

// DB-independent per-process backstop: bounds Opus spend even if every DB
// control fails open. Resets on UTC-day rollover.
const inMemoryGlobalOpus = { day: '', count: 0 };
function reserveGlobalOpusSlot(): boolean {
  const day = utcDay();
  if (inMemoryGlobalOpus.day !== day) {
    inMemoryGlobalOpus.day = day;
    inMemoryGlobalOpus.count = 0;
  }
  if (inMemoryGlobalOpus.count >= globalOpusCap()) return false;
  inMemoryGlobalOpus.count += 1;
  return true;
}

// Test helper.
export function __resetGlobalOpusCounter(): void {
  inMemoryGlobalOpus.day = '';
  inMemoryGlobalOpus.count = 0;
}

export async function runPipeline(
  inputs: WizardInputs,
  opts: { userId: string | null; studentGrade?: string } = { userId: null },
): Promise<PipelineResult> {
  const budgetOk = await budgetAvailable();
  let fallbackReason: PipelineResult['fallbackReason'];

  // Gate Opus on: dollar budget (fails closed) AND the in-memory backstop AND
  // the DB-backed global daily call cap. Any miss → deterministic fallback.
  // The in-memory slot is reserved before the DB cap / Opus call and is never
  // released — a denial or Opus error leaves it counted. That over-counts in
  // the SAFE direction (the cap can only trip earlier, never spend more); do
  // not "fix" it by releasing slots, which would reintroduce a TOCTOU race.
  // The global DB cap is failClosed: a DB outage under a flood denies Opus
  // (like the budget), so the ~GLOBAL_OPUS_CALLS_PER_DAY ceiling holds without
  // depending on per-process memory.
  let opusAllowed = budgetOk;
  if (opusAllowed && !reserveGlobalOpusSlot()) opusAllowed = false;
  if (opusAllowed) {
    const g = await checkAndRecord(`global:opus:${utcDay()}`, { limit: globalOpusCap(), windowSeconds: 86400, failClosed: true });
    if (!g.allowed) opusAllowed = false;
  }

  if (opusAllowed) {
    const rag = await fetchRagContext({ userId: opts.userId, courseId: inputs.courseId, mode: inputs.mode });
    const ragText = buildRagContext(rag);
    const result = await generateFullPromptWithOpus(inputs, ragText, opts.studentGrade);
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

  const prompt = assembleDeterministicPrompt(inputs, { studentGrade: opts.studentGrade });
  return {
    prompt,
    promptHash: promptHash(prompt),
    generator: 'deterministic',
    fallbackReason,
  };
}
