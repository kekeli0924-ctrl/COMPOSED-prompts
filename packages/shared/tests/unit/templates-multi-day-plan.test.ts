import { describe, it, expect } from 'vitest';
import { buildMultiDayPlanOutputSpec, buildMultiDayPlanFallbackInteractionStyle } from '../../src/templates/multi-day-plan';
import type { WizardInputs } from '@composed-prompts/shared';

const inputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'multi-day-plan',
  assessmentType: 'test',
  assessmentDate: '2026-06-10',
  hoursAvailable: 72,
  confidence: 3,
};

describe('multi-day-plan template', () => {
  it('output spec asks for a day-by-day schedule', () => {
    const out = buildMultiDayPlanOutputSpec(inputs);
    expect(out).toMatch(/day-by-day|each day|daily/i);
    expect(out).toMatch(/quiz|self-test|check/i);
  });

  it('output spec splits hours into sessions', () => {
    const out = buildMultiDayPlanOutputSpec(inputs);
    expect(out).toMatch(/session/i);
  });

  it('interaction style emphasizes spaced practice', () => {
    const out = buildMultiDayPlanFallbackInteractionStyle(inputs);
    expect(out).toMatch(/spaced|space out|interleav/i);
  });
});
