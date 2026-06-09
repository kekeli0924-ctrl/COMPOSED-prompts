import { describe, it, expect } from 'vitest';
import {
  OPUS_SYSTEM_PROMPT,
  OPUS_SYSTEM_PROMPT_V1,
  OPUS_SYSTEM_PROMPT_V2,
  SYSTEM_PROMPTS,
} from '@composed-prompts/shared/src/generation/opus-full-prompt.js';
import {
  ACTIVE_TEMPLATE_VERSION,
  RECAP_START_MARKER,
  RECAP_WEAK_SPOTS_MARKER,
  RECAP_FOLLOW_UP_MARKER,
  RECAP_END_MARKER,
} from '@composed-prompts/shared';

describe('OPUS_SYSTEM_PROMPT encodes the evidence-based directives', () => {
  const p = OPUS_SYSTEM_PROMPT;
  it('leads with retrieval practice', () => {
    expect(p).toMatch(/Retrieval practice/i);
    expect(p).toMatch(/before you explain/i);
  });
  it('mixes question formats', () => {
    expect(p).toMatch(/multiple-choice and short-answer/i);
  });
  it('forces self-explanation', () => {
    expect(p).toMatch(/self-explanation/i);
    expect(p).toMatch(/underlying principle/i);
  });
  it('uses the LearnLM tutoring stance', () => {
    expect(p).toMatch(/do not give away answers/i);
    expect(p).toMatch(/discover their own mistakes/i);
  });
  it('scales scaffolding to confidence', () => {
    expect(p).toMatch(/scaffolding to the student's confidence/i);
  });
});

describe('system prompt versions (v1 frozen, v2 active)', () => {
  it('the active prompt is v2, selected through the version map', () => {
    expect(ACTIVE_TEMPLATE_VERSION).toBe('v2');
    expect(OPUS_SYSTEM_PROMPT).toBe(OPUS_SYSTEM_PROMPT_V2);
    expect(SYSTEM_PROMPTS.v1).toBe(OPUS_SYSTEM_PROMPT_V1);
    expect(SYSTEM_PROMPTS.v2).toBe(OPUS_SYSTEM_PROMPT_V2);
    expect(Object.keys(SYSTEM_PROMPTS).sort()).toEqual(['v1', 'v2']);
  });

  it('v1 is preserved without the v2 additions', () => {
    expect(OPUS_SYSTEM_PROMPT_V1).not.toContain(RECAP_START_MARKER);
    expect(OPUS_SYSTEM_PROMPT_V1).not.toMatch(/sure \/ unsure \/ guessing/);
  });

  it('v2 mandates the literal recap sentinel format', () => {
    for (const marker of [RECAP_START_MARKER, RECAP_WEAK_SPOTS_MARKER, RECAP_FOLLOW_UP_MARKER, RECAP_END_MARKER]) {
      expect(OPUS_SYSTEM_PROMPT_V2).toContain(marker);
    }
    expect(OPUS_SYSTEM_PROMPT_V2).toMatch(/paste this recap back into Composed/i);
  });

  it('v2 adds confidence calibration to the interaction style', () => {
    expect(OPUS_SYSTEM_PROMPT_V2).toMatch(/sure \/ unsure \/ guessing/);
    expect(OPUS_SYSTEM_PROMPT_V2).toMatch(/confidently-wrong/i);
  });

  it('v2 keeps every v1 directive (the changes are additive)', () => {
    for (const directive of [
      /Retrieval practice/i,
      /multiple-choice and short-answer/i,
      /self-explanation/i,
      /do not give away answers/i,
      /discover their own mistakes/i,
      /scaffolding to the student's confidence/i,
    ]) {
      expect(OPUS_SYSTEM_PROMPT_V2).toMatch(directive);
    }
  });
});
