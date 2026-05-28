import { describe, it, expect } from 'vitest';
import { WizardInputsSchema, FeedbackPayloadSchema } from '@/lib/validation/wizard-inputs';

const validInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-01',
  hoursAvailable: 4,
};

describe('WizardInputsSchema', () => {
  it('accepts a minimal valid input', () => {
    const r = WizardInputsSchema.safeParse(validInputs);
    expect(r.success).toBe(true);
  });

  it('rejects missing provider', () => {
    const r = WizardInputsSchema.safeParse({ ...validInputs, provider: undefined });
    expect(r.success).toBe(false);
  });

  it('rejects bad date format', () => {
    const r = WizardInputsSchema.safeParse({ ...validInputs, assessmentDate: '06/01/2026' });
    expect(r.success).toBe(false);
  });

  it('rejects material over 20000 chars', () => {
    const r = WizardInputsSchema.safeParse({
      ...validInputs,
      material: 'x'.repeat(20001),
    });
    expect(r.success).toBe(false);
  });

  it('accepts material at the limit', () => {
    const r = WizardInputsSchema.safeParse({
      ...validInputs,
      material: 'x'.repeat(20000),
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown mode', () => {
    const r = WizardInputsSchema.safeParse({ ...validInputs, mode: 'invalid-mode' });
    expect(r.success).toBe(false);
  });

  it('allows courseId null with courseFreeText', () => {
    const r = WizardInputsSchema.safeParse({
      ...validInputs,
      courseId: null,
      courseFreeText: 'Independent reading on Camus',
    });
    expect(r.success).toBe(true);
  });

  it('rejects courseId null without courseFreeText', () => {
    const r = WizardInputsSchema.safeParse({
      ...validInputs,
      courseId: null,
      courseFreeText: undefined,
    });
    expect(r.success).toBe(false);
  });
});

describe('FeedbackPayloadSchema', () => {
  it('accepts a valid feedback payload', () => {
    const r = FeedbackPayloadSchema.safeParse({
      promptHash: 'a'.repeat(64),
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      mode: 'cram-review',
      courseId: 'arts-acting-and-improv',
      rating: 4,
    });
    expect(r.success).toBe(true);
  });

  it('rejects rating outside 1-5', () => {
    const r = FeedbackPayloadSchema.safeParse({
      promptHash: 'a'.repeat(64),
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      mode: 'cram-review',
      courseId: null,
      rating: 7,
    });
    expect(r.success).toBe(false);
  });
});
