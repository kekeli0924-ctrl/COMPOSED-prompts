import { describe, it, expect } from 'vitest';
import { buildEssayProjectOutputSpec, buildEssayProjectFallbackInteractionStyle } from '../../src/templates/essay-project';
import type { WizardInputs } from '@composed-prompts/shared';

const inputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'essay-project',
  assessmentType: 'paper',
  assessmentDate: '2026-06-01',
  hoursAvailable: 6,
  confidence: 3,
};

describe('essay-project template', () => {
  it('output spec includes outline + thesis + evidence + draft plan', () => {
    const out = buildEssayProjectOutputSpec(inputs);
    expect(out).toMatch(/outline/i);
    expect(out).toMatch(/thesis/i);
    expect(out).toMatch(/evidence|sources/i);
    expect(out).toMatch(/draft/i);
  });

  it('interaction style refuses to write the essay for me', () => {
    const out = buildEssayProjectFallbackInteractionStyle(inputs);
    expect(out).toMatch(/won't write|not write.*for me|don't write the/i);
  });
});
