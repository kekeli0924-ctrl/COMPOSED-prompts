import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WizardInputs } from '@composed-prompts/shared';

const { mockGenerateOpus, mockBudgetCheck, mockBudgetRecord } = vi.hoisted(() => ({
  mockGenerateOpus: vi.fn(),
  mockBudgetCheck: vi.fn(),
  mockBudgetRecord: vi.fn(),
}));

vi.mock('@composed-prompts/shared/src/generation/opus-full-prompt', () => ({
  generateFullPromptWithOpus: mockGenerateOpus,
}));

vi.mock('@/lib/budget', () => ({
  budgetAvailable: mockBudgetCheck,
  recordSpend: mockBudgetRecord,
}));

import { runPipeline } from '@/lib/pipeline';

const inputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'science-astronomy-ii',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-15',
  hoursAvailable: 2,
  confidence: 3,
};

describe('runPipeline', () => {
  beforeEach(() => {
    mockGenerateOpus.mockReset();
    mockBudgetCheck.mockReset();
    mockBudgetRecord.mockReset();
    mockBudgetCheck.mockResolvedValue(true);
    mockBudgetRecord.mockResolvedValue(undefined);
  });

  it('returns opus prompt when budget OK + API succeeds', async () => {
    mockGenerateOpus.mockResolvedValueOnce({
      ok: true,
      prompt: 'OPUS-WRITTEN PROMPT',
      usage: { input_tokens: 100, output_tokens: 200 },
    });
    const r = await runPipeline(inputs);
    expect(r.generator).toBe('opus');
    expect(r.prompt).toBe('OPUS-WRITTEN PROMPT');
    expect(r.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(mockBudgetRecord).toHaveBeenCalled();
  });

  it('falls back to deterministic when budget exhausted', async () => {
    mockBudgetCheck.mockResolvedValueOnce(false);
    const r = await runPipeline(inputs);
    expect(r.generator).toBe('deterministic');
    expect(r.fallbackReason).toBe('budget-exhausted');
    expect(mockGenerateOpus).not.toHaveBeenCalled();
  });

  it('falls back to deterministic when Opus errors', async () => {
    mockGenerateOpus.mockResolvedValueOnce({ ok: false, error: 'api-error' });
    const r = await runPipeline(inputs);
    expect(r.generator).toBe('deterministic');
    expect(r.fallbackReason).toBe('api-error');
  });
});
