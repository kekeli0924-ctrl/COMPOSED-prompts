import {
  type WizardInputs,
  assembleDeterministicPrompt,
  buildRecapContextBlock,
  getActiveTemplateVersion,
} from '@composed-prompts/shared';
import { generateFullPromptWithOpus, generateFullPromptWithModel } from '@composed-prompts/shared/src/generation/opus-full-prompt.js';
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

// Sonnet middle tier — pricing estimates are env-configurable because list prices
// drift; verify against current Anthropic pricing when they change.
const envPrice = (name: string, dflt: number): number => {
  const n = parseFloat(process.env[name] ?? '');
  return Number.isFinite(n) && n >= 0 ? n : dflt;
};
const estimateSonnetSpendUsd = (usage: { input_tokens: number; output_tokens: number }): number =>
  (usage.input_tokens / 1_000_000) * envPrice('SONNET_EST_INPUT_USD_PER_MTOK', 3) +
  (usage.output_tokens / 1_000_000) * envPrice('SONNET_EST_OUTPUT_USD_PER_MTOK', 15);

const sonnetModel = (): string => process.env.SONNET_MODEL ?? 'claude-sonnet-4-6';

const globalSonnetCap = (): number => {
  const n = parseInt(process.env.GLOBAL_SONNET_CALLS_PER_DAY ?? '500', 10);
  return Number.isFinite(n) && n > 0 ? n : 500;
};

export type PipelineResult = {
  prompt: string;
  promptHash: string;
  generator: 'opus' | 'sonnet' | 'deterministic';
  templateVersion: string;
  // Present ONLY when a recap was actually injected into the prompt that was produced
  // (opus or sonnet success). Id + timestamp only — never recap content.
  usedRecap?: { id: string; createdAt: string };
  // 'opus-capped' appears on SUCCESSFUL sonnet rows (it records why Sonnet ran, so
  // quality can be compared later) — not only on deterministic fallbacks.
  fallbackReason?: 'budget-exhausted' | 'api-error' | 'opus-capped';
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
  let opusCapped = false; // blocked by a CALL CAP (not the dollar budget)
  if (opusAllowed && !reserveGlobalOpusSlot()) {
    opusAllowed = false;
    opusCapped = true;
  }
  if (opusAllowed) {
    const g = await checkAndRecord(`global:opus:${utcDay()}`, { limit: globalOpusCap(), windowSeconds: 86400, failClosed: true });
    if (!g.allowed) {
      opusAllowed = false;
      opusCapped = true;
    }
  }

  // Sonnet middle tier: ONLY when Opus was blocked by a call cap while the dollar
  // budget still has headroom. Budget exhaustion is the hard stop — no Sonnet.
  // Sonnet has its own DB-backed daily cap (fail closed, like the Opus DB cap).
  let sonnetAllowed = false;
  if (!opusAllowed && opusCapped && budgetOk) {
    const s = await checkAndRecord(`global:sonnet:${utcDay()}`, { limit: globalSonnetCap(), windowSeconds: 86400, failClosed: true });
    sonnetAllowed = s.allowed;
  }

  if (opusAllowed || sonnetAllowed) {
    const rag = await fetchRagContext({ userId: opts.userId, courseId: inputs.courseId, mode: inputs.mode });
    const ragText = buildRagContext(rag);

    // Stage 2: the student's OWN most recent recap for this course, injected as
    // delimited untrusted data. Model paths only (deterministic templates are not
    // recap-aware). Requires: opted in (default on), signed in, catalog course.
    const useRecap = inputs.useRecap !== false;
    const recap =
      useRecap && opts.userId && inputs.courseId
        ? await findUsableRecap(opts.userId, inputs.courseId)
        : null;
    const recapContext = recap ? buildRecapContextBlock(recap) : '';
    const usedRecap = recap ? { usedRecap: { id: recap.id, createdAt: recap.createdAt.toISOString() } } : {};

    if (opusAllowed) {
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
          ...usedRecap,
        };
      }
      // An Opus API error is not a cap — per the decision rules it falls straight
      // to deterministic, never to Sonnet.
      fallbackReason = 'api-error';
    } else {
      const result = await generateFullPromptWithModel(sonnetModel(), inputs, ragText, opts.studentGrade, templateVersion, recapContext);
      if (result.ok) {
        await recordSpend(estimateSonnetSpendUsd(result.usage));
        return {
          prompt: result.prompt,
          promptHash: promptHash(result.prompt),
          generator: 'sonnet',
          templateVersion,
          fallbackReason: 'opus-capped', // why sonnet ran — for later quality comparison
          ...usedRecap,
        };
      }
      fallbackReason = 'api-error';
    }
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
