import { describe, it, expect } from 'vitest';
import { buildConceptClarificationOutputSpec, buildConceptClarificationFallbackInteractionStyle } from '@/lib/templates/concept-clarification';
import type { WizardInputs } from '@/lib/types';

const inputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'concept-clarification',
  assessmentType: 'test',
  assessmentDate: '2026-06-01',
  hoursAvailable: 1,
  confidence: 2,
  confusion: 'How does stanislavski differ from method acting?',
};

describe('concept-clarification template', () => {
  it('output spec asks for explanation + analogy + example + check', () => {
    const out = buildConceptClarificationOutputSpec(inputs);
    expect(out).toMatch(/explanation/i);
    expect(out).toMatch(/analogy|metaphor/i);
    expect(out).toMatch(/example/i);
    expect(out).toMatch(/check|verify|self-test/i);
  });

  it('interaction style uses Socratic + adaptive language', () => {
    const out = buildConceptClarificationFallbackInteractionStyle(inputs);
    expect(out).toMatch(/socratic|ask me|small steps/i);
  });
});
