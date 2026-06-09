// Recap wire format — single source of truth (browser-safe: no Node/SDK imports).
//
// The v2 generated prompt instructs the student's downstream AI to close each study
// session with a recap in this exact sentinel format. The student pastes that recap
// back into Composed; parseRecapText() turns it into structured weak spots + a
// follow-up prompt. Plain sentinel LINES, deliberately not code fences — fences get
// mangled when students copy out of chat UIs.

export const RECAP_START_MARKER = '===COMPOSED RECAP START===';
export const RECAP_WEAK_SPOTS_MARKER = 'WEAK SPOTS:';
export const RECAP_FOLLOW_UP_MARKER = 'FOLLOW-UP PROMPT:';
export const RECAP_END_MARKER = '===COMPOSED RECAP END===';

// Defensive output caps — recap text is arbitrary third-party model output plus
// student paste, so bound everything we extract.
export const MAX_WEAK_SPOTS = 15;
export const MAX_WEAK_SPOT_CHARS = 300;
export const MAX_FOLLOW_UP_CHARS = 4000;

export type ParsedRecap = {
  weakSpots: string[];
  followUpPrompt: string | null;
};

// A line "is" a marker when it starts with it, case-insensitively, after trimming —
// tolerant of odd casing and surrounding whitespace, and of trailing text on the
// marker line. Matching at line START (not substring-in-line) keeps marker text
// INSIDE a weak-spot bullet from terminating a section early (adversarial input).
const lineStartsWithMarker = (line: string, marker: string): boolean =>
  line.trim().toUpperCase().startsWith(marker.toUpperCase());

const BULLET_RE = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/;

/**
 * Tolerant parser for the session-recap block. Accepts: markers in any casing,
 * surrounding whitespace, the block embedded anywhere in a longer paste, `-`/`*`/`•`/
 * numbered bullets, and a missing FOLLOW-UP section or END marker. Returns null only
 * when no start marker is present or no candidate block yields weak spots.
 *
 * When MULTIPLE blocks are present, the LAST parseable one wins. This is load-bearing:
 * the generated prompt's SELF-CHECK section contains a literal (and therefore
 * parseable) copy of this format as INSTRUCTIONS, so a student pasting their whole
 * conversation back leads with that instruction block — the genuine recap their tutor
 * emitted comes at the end. Each block's sections are bounded by its own END marker
 * (or the next START marker), so a malformed block can never bleed into, mask, or
 * scavenge content from elsewhere in the paste.
 */
export function parseRecapText(text: string): ParsedRecap | null {
  const lines = text.split(/\r?\n/);

  const startIdxs: number[] = [];
  for (let i = 0; i < lines.length; i++) {
    if (lineStartsWithMarker(lines[i]!, RECAP_START_MARKER)) startIdxs.push(i);
  }
  if (startIdxs.length === 0) return null;

  let result: ParsedRecap | null = null;
  for (let b = 0; b < startIdxs.length; b++) {
    const blockLimit = b + 1 < startIdxs.length ? startIdxs[b + 1]! : lines.length;
    const candidate = parseBlock(lines, startIdxs[b]!, blockLimit);
    if (candidate) result = candidate; // last parseable block wins
  }
  return result;
}

// Parse one candidate block: lines (startIdx, limitExclusive), further bounded by the
// block's own END marker if present. Returns null when the block has no WEAK SPOTS
// section or no extractable bullets — without ever reading outside its bounds.
function parseBlock(lines: string[], startIdx: number, limitExclusive: number): ParsedRecap | null {
  let blockEnd = limitExclusive;
  for (let i = startIdx + 1; i < limitExclusive; i++) {
    if (lineStartsWithMarker(lines[i]!, RECAP_END_MARKER)) {
      blockEnd = i;
      break;
    }
  }

  let weakIdx = -1;
  for (let i = startIdx + 1; i < blockEnd; i++) {
    if (lineStartsWithMarker(lines[i]!, RECAP_WEAK_SPOTS_MARKER)) {
      weakIdx = i;
      break;
    }
  }
  if (weakIdx === -1) return null;

  let followIdx = -1;
  for (let i = weakIdx + 1; i < blockEnd; i++) {
    if (lineStartsWithMarker(lines[i]!, RECAP_FOLLOW_UP_MARKER)) {
      followIdx = i;
      break;
    }
  }

  const weakSectionEnd = followIdx !== -1 ? followIdx : blockEnd;
  const weakSpots: string[] = [];
  for (let i = weakIdx + 1; i < weakSectionEnd; i++) {
    const m = lines[i]!.match(BULLET_RE);
    if (!m) continue; // tolerate prose/blank lines between bullets
    const item = m[1]!.trim().slice(0, MAX_WEAK_SPOT_CHARS);
    if (item.length > 0) weakSpots.push(item);
    if (weakSpots.length >= MAX_WEAK_SPOTS) break;
  }
  if (weakSpots.length === 0) return null;

  let followUpPrompt: string | null = null;
  if (followIdx !== -1) {
    // Content may begin on the marker line itself ("FOLLOW-UP PROMPT: do X...").
    const sameLine = lines[followIdx]!.trim().slice(RECAP_FOLLOW_UP_MARKER.length).trim();
    const rest = lines.slice(followIdx + 1, blockEnd).join('\n').trim();
    const combined = [sameLine, rest].filter(Boolean).join('\n').trim();
    followUpPrompt = combined.length > 0 ? combined.slice(0, MAX_FOLLOW_UP_CHARS) : null;
  }

  return { weakSpots, followUpPrompt };
}
