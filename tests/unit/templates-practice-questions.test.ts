import { describe, it, expect } from 'vitest';
import { buildPracticeQuestionsOutputSpec, buildPracticeQuestionsFallbackInteractionStyle } from '@/lib/templates/practice-questions';
import type { WizardInputs } from '@/lib/types';

const inputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'practice-questions',
  assessmentType: 'test',
  assessmentDate: '2026-06-01',
  hoursAvailable: 2,
  confidence: 3,
};

describe('practice-questions template', () => {
  it('output spec includes mixed question formats matched to assessment type', () => {
    const out = buildPracticeQuestionsOutputSpec(inputs);
    expect(out).toMatch(/multiple.choice|mc/i);
    expect(out).toMatch(/short.answer/i);
  });

  it('output spec separates answers from questions', () => {
    const out = buildPracticeQuestionsOutputSpec(inputs);
    expect(out).toMatch(/separate.*answer|answer.*separate/i);
  });

  it('output spec for paper/essay assessment includes essay-style questions', () => {
    const out = buildPracticeQuestionsOutputSpec({ ...inputs, assessmentType: 'paper' });
    expect(out).toMatch(/essay|long.form|prompt/i);
  });

  it('interaction style emphasizes self-test before showing answers', () => {
    const out = buildPracticeQuestionsFallbackInteractionStyle(inputs);
    expect(out).toMatch(/self-?test|don't.*answer.*until|wait/i);
  });
});
