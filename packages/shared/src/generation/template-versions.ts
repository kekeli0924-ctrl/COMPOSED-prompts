/**
 * Generation template-version registry (instrumentation only).
 *
 * Records WHICH version of our prompt-engineering logic produced each generation,
 * so future changes to the Opus system prompt and the deterministic templates can
 * be A/B-tested against real rated outcomes. This module is BROWSER-SAFE: it imports
 * no Node built-ins and no SDKs, so it is safe to re-export from the shared barrel
 * and bundle into the web client.
 *
 * It stores identifiers + short human notes ONLY — never prompt text. The prompt
 * content has exactly one home (OPUS_SYSTEM_PROMPT + templates/*); duplicating it
 * here would only create drift.
 */

export type TemplateVersionId = 'v1' | 'v2';

export type TemplateVersion = {
  id: TemplateVersionId;
  /** Human-readable note: what this version's prompt engineering is. No prompt text. */
  description: string;
};

/**
 * The registered versions. Never edit an existing version's meaning in place — rows
 * already stamped with its id were generated under it. Register a NEW id instead.
 * (Ids/descriptions only — the version → system-prompt map lives in the Node-only
 * generation/opus-full-prompt.ts.)
 */
export const TEMPLATE_VERSIONS: Record<TemplateVersionId, TemplateVersion> = {
  v1: {
    id: 'v1',
    description:
      'Evidence-based 7-section Pomfret-Study framework: retrieval-first Opus system prompt + deterministic fallback templates (initial instrumented version).',
  },
  v2: {
    id: 'v2',
    description:
      'v1 plus: session-closing recap emitted in the parseable sentinel wire format (paste-back capture), and confidence calibration (rate sure/unsure/guessing before reveals; confidently-wrong answers flagged top priority).',
  },
};

/** The version every generation is stamped with today. */
export const ACTIVE_TEMPLATE_VERSION: TemplateVersionId = 'v2';

export type TemplateVersionSelectOpts = {
  /**
   * Stable per-generation seed for deterministic A/B bucketing (e.g. a user id or
   * IP hash) — the same seed always lands in the same bucket. Only consulted when
   * A/B testing is enabled AND more than one variant is registered; neither holds
   * today, so this is currently unused.
   */
  seed?: string;
};

/**
 * FNV-1a 32-bit string hash — tiny, dependency-free, deterministic, browser-safe
 * (no node:crypto). Used only to bucket a seed across registered variants once A/B
 * testing is turned on.
 */
function fnv1a32(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    // 32-bit FNV prime multiply; `>>> 0` keeps it an unsigned 32-bit int.
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

/** True only when the env flag is explicitly enabled; typeof-guarded so the browser bundle is safe. */
function abTestingEnabled(): boolean {
  return typeof process !== 'undefined' && process.env?.TEMPLATE_AB_ENABLED === '1';
}

/**
 * Pick the template version for a generation. Returns ACTIVE_TEMPLATE_VERSION
 * by default.
 *
 * A/B bucketing hook — DISABLED by default. It only diverges from the active version
 * when ALL of these hold: the env flag TEMPLATE_AB_ENABLED is '1', a stable `seed` is
 * supplied, AND more than one variant is registered. NOTE: with v1 AND v2 registered,
 * the last condition now holds — so setting TEMPLATE_AB_ENABLED='1' in production
 * would start a live 50/50 split. Leave the flag UNSET until a deliberate A/B
 * (the offline eval harness is the intended comparison tool first). Also note: only
 * the Opus system prompt is version-selected — the deterministic templates have no v1
 * variant — so a v1 bucket that fell back to deterministic would emit v2 content
 * stamped 'v1'. Resolve that before ever enabling a live split.
 */
export function getActiveTemplateVersion(opts: TemplateVersionSelectOpts = {}): TemplateVersionId {
  const ids = Object.keys(TEMPLATE_VERSIONS) as TemplateVersionId[];

  if (abTestingEnabled() && opts.seed && ids.length > 1) {
    return ids[fnv1a32(opts.seed) % ids.length]!;
  }

  return ACTIVE_TEMPLATE_VERSION;
}
