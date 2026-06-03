import { describe, it, expect } from 'vitest';
import { OPUS_SYSTEM_PROMPT } from '@composed-prompts/shared/src/generation/opus-full-prompt.js';

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
