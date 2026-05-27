import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WizardInputs } from '@/lib/types';

const { mockGenerateInteractionStyle, mockBudgetCheck, mockBudgetRecord } = vi.hoisted(() => ({
  mockGenerateInteractionStyle: vi.fn(),
  mockBudgetCheck: vi.fn(),
  mockBudgetRecord: vi.fn(),
}));

vi.mock('@/lib/generation/interaction-style', () => ({
  generateInteractionStyle: mockGenerateInteractionStyle,
}));

vi.mock('@/lib/budget/daily-cap', () => ({
  budgetAvailable: mockBudgetCheck,
  recordSpend: mockBudgetRecord,
}));

import { runPipeline } from '@/lib/generation/pipeline';

const inputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-01',
  hoursAvailable: 2,
  confidence: 3,
};

describe('runPipeline', () => {
  beforeEach(() => {
    mockGenerateInteractionStyle.mockReset();
    mockBudgetCheck.mockReset();
    mockBudgetRecord.mockReset();
    mockBudgetCheck.mockResolvedValue(true);
    mockBudgetRecord.mockResolvedValue(undefined);
  });

  it('uses Sonnet output when budget allows + API succeeds', async () => {
    mockGenerateInteractionStyle.mockResolvedValueOnce({
      ok: true,
      text: 'Interaction style: rapid-fire quiz, brief corrections.',
      usage: { input_tokens: 100, output_tokens: 30 },
    });
    const result = await runPipeline(inputs);
    expect(result.metadata.sonnetUsed).toBe(true);
    expect(result.prompt).toContain('rapid-fire quiz');
    expect(result.metadata.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(mockBudgetRecord).toHaveBeenCalled();
  });

  it('falls back to deterministic when budget exhausted', async () => {
    mockBudgetCheck.mockResolvedValueOnce(false);
    const result = await runPipeline(inputs);
    expect(result.metadata.sonnetUsed).toBe(false);
    expect(result.metadata.fallbackReason).toBe('budget-exhausted');
    expect(mockGenerateInteractionStyle).not.toHaveBeenCalled();
  });

  it('falls back to deterministic when Sonnet errors', async () => {
    mockGenerateInteractionStyle.mockResolvedValueOnce({ ok: false, error: 'api-error' });
    const result = await runPipeline(inputs);
    expect(result.metadata.sonnetUsed).toBe(false);
    expect(result.metadata.fallbackReason).toBe('api-error');
  });

  it('returns a deterministic prompt even without Sonnet', async () => {
    mockBudgetCheck.mockResolvedValueOnce(false);
    const result = await runPipeline(inputs);
    expect(result.prompt).toMatch(/Interaction style:/);
    expect(result.prompt.length).toBeGreaterThan(200);
  });
});
