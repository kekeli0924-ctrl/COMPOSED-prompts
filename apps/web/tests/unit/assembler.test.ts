import { describe, it, expect } from 'vitest';
import { assembleDeterministicPrompt } from '@/lib/generation/assembler';
import type { WizardInputs } from '@/lib/types';

const inputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-01',
  hoursAvailable: 2,
  confidence: 3,
  material: 'Stanislavski method',
};

describe('assembleDeterministicPrompt', () => {
  it('includes all 7 sections in order for xml format', () => {
    const out = assembleDeterministicPrompt(inputs);
    const expected = ['<role>', '<about_me>', '<material>', '<goal>', '<interaction_style>', '<output_spec>', '<self_check>'];
    let lastIdx = -1;
    for (const tag of expected) {
      const idx = out.indexOf(tag);
      expect(idx, `${tag} present`).toBeGreaterThan(-1);
      expect(idx, `${tag} in order`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it('uses markdown headings for openai models', () => {
    const out = assembleDeterministicPrompt({ ...inputs, provider: 'openai', model: 'gpt-5' });
    expect(out).toContain('## ROLE');
    expect(out).toContain('## OUTPUT_SPEC');
  });

  it('uses numbered steps for gemini models', () => {
    const out = assembleDeterministicPrompt({ ...inputs, provider: 'google', model: 'gemini-2-5-pro' });
    expect(out).toMatch(/Step 1 — ROLE/);
  });

  it('uses the fallback interaction style (deterministic baseline)', () => {
    const out = assembleDeterministicPrompt(inputs);
    expect(out).toMatch(/Interaction style:/);
  });

  it('respects the chosen mode for the output spec', () => {
    const out = assembleDeterministicPrompt({ ...inputs, mode: 'practice-questions' });
    expect(out).toMatch(/multiple.choice|short.answer/i);
  });
});
