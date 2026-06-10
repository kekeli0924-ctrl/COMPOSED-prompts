import {
  type WizardInputs,
  assembleDeterministicPrompt,
  buildRecapContextBlock,
  getActiveTemplateVersion,
} from '@composed-prompts/shared';
import { generateFullPromptWithOpus } from '@composed-prompts/shared/src/generation/opus-full-prompt.js';
import { promptHash } from '@composed-prompts/shared/src/storage/prompt-hash.js';
import { budgetAvailable, recordSpend } from './budget.js';
import { checkAndRecord } from './rate-limit.js';
import { fetchRagContext, buildRagContext } from './rag.js';
import { findUsableRecap } from './recaps.js';

const OPUS_INPUT_USD_PER_MTOK = 5.0;
const OPUS_OUTPUT_USD_PER_MTOK = 25.0;

const estimateOpusSpendUsd = (usage: { input_tokens: number; output_tokens: number }): number =>
  (usage.input_tokens / 1_000_000) * OPUS_INPUT_USD_PER_MTOK +
  (usage.output_tokens / 1_000_000) * OPUS_OUTPUT_USD_PER_MTOK;

export type PipelineResult = {
  prompt: string;
  promptHash: string;
  generator: 'opus' | 'deterministic';
  templateVersion: string;
  // Present ONLY when a recap was actually injected into the prompt that was produced
  // (opus success). Id + timestamp only — never recap content.
  usedRecap?: { id: string; createdAt: string };
  fallbackReason?: 'budget-exhausted' | 'api-error';
};

const globalOpusCap = (): number => {
  const n = parseInt(process.env.GLOBAL_OPUS_CALLS_PER_DAY ?? '250', 10);
  return Number.isFinite(n) && n > 0 ? n : 250;
};

const utcDay = (now: Date = new Date()): string => {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}-${String(now.getUTCDate()).padStart(2, '0')}`;
};

// DB-independent per-process backstop: bounds Opus spend even if every DB
// control fails open. Resets on UTC-day rollover. `now` is injectable so a test can
// simulate a day rollover (default real clock → the two callers are unaffected).
const inMemoryGlobalOpus = { day: '', count: 0 };
export function reserveGlobalOpusSlot(now: Date = new Date()): boolean {
  const day = utcDay(now);
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
  // Stamp the prompt-engineering version on every persisted row (all return paths
  // below). A/B bucketing is a no-op today; seed by user so a future split stays
  // stable per student. This identifies the prompt logic, not opus-vs-deterministic.
  const templateVersion = getActiveTemplateVersion({ seed: opts.userId ?? undefined });
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

    // Stage 2: the student's OWN most recent recap for this course, injected as
    // delimited untrusted data. Opus path only (deterministic templates are not
    // recap-aware). Requires: opted in (default on), signed in, catalog course.
    const useRecap = inputs.useRecap !== false;
    const recap =
      useRecap && opts.userId && inputs.courseId
        ? await findUsableRecap(opts.userId, inputs.courseId)
        : null;
    const recapContext = recap ? buildRecapContextBlock(recap) : '';

    // Pass the stamped version so the stored template_version always matches the
    // system prompt actually used for this generation.
    const result = await generateFullPromptWithOpus(inputs, ragText, opts.studentGrade, templateVersion, recapContext);
    if (result.ok) {
      await recordSpend(estimateOpusSpendUsd(result.usage));
      return {
        prompt: result.prompt,
        promptHash: promptHash(result.prompt),
        generator: 'opus',
        templateVersion,
        // Only the prompt that actually carried the recap claims it.
        ...(recap ? { usedRecap: { id: recap.id, createdAt: recap.createdAt.toISOString() } } : {}),
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
    templateVersion,
    fallbackReason,
  };
}
