import { describe, it, expect } from 'vitest';
import { buildCramReviewOutputSpec, buildCramReviewFallbackInteractionStyle } from '../../src/templates/cram-review';
import type { WizardInputs } from '@composed-prompts/shared';

const inputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-01',
  hoursAvailable: 2,
  confidence: 2,
};

describe('cram-review template', () => {
  it('outputs a rapid-quiz-style deliverable spec', () => {
    const out = buildCramReviewOutputSpec(inputs);
    expect(out).toMatch(/quiz|practice|self-test/i);
  });

  it('fallback interaction style instructs rapid-quizzing for low-confidence cram', () => {
    const out = buildCramReviewFallbackInteractionStyle(inputs);
    expect(out).toMatch(/quick.?fire|rapid|brief/i);
    expect(out).toMatch(/re-?test|re-?ask/i);
  });

  it('fallback interaction style for high-confidence + time emphasizes depth', () => {
    const out = buildCramReviewFallbackInteractionStyle({ ...inputs, confidence: 5, hoursAvailable: 8 });
    expect(out).toMatch(/depth|deeper|harder/i);
  });
});
