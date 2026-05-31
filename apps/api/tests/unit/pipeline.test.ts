import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WizardInputs } from '@composed-prompts/shared';

const { mockGenerateOpus, mockBudgetCheck, mockBudgetRecord, mockCheckAndRecord } = vi.hoisted(() => ({
  mockGenerateOpus: vi.fn(),
  mockBudgetCheck: vi.fn(),
  mockBudgetRecord: vi.fn(),
  mockCheckAndRecord: vi.fn(),
}));

vi.mock('@composed-prompts/shared/src/generation/opus-full-prompt.js', () => ({
  generateFullPromptWithOpus: mockGenerateOpus,
}));

vi.mock('@/lib/budget', () => ({
  budgetAvailable: mockBudgetCheck,
  recordSpend: mockBudgetRecord,
}));

vi.mock('@/lib/rate-limit', () => ({ checkAndRecord: mockCheckAndRecord }));

import { runPipeline, __resetGlobalOpusCounter } from '@/lib/pipeline';

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
    mockCheckAndRecord.mockReset();
    mockBudgetCheck.mockResolvedValue(true);
    mockBudgetRecord.mockResolvedValue(undefined);
    mockCheckAndRecord.mockResolvedValue({ allowed: true, remaining: 100 });
    __resetGlobalOpusCounter();
    delete process.env.GLOBAL_OPUS_CALLS_PER_DAY;
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

  it('falls back to deterministic when the global Opus DB cap is exceeded', async () => {
    mockCheckAndRecord.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const r = await runPipeline(inputs);
    expect(r.generator).toBe('deterministic');
    expect(r.fallbackReason).toBe('budget-exhausted');
    expect(mockGenerateOpus).not.toHaveBeenCalled();
  });

  it('falls back to deterministic once the in-memory global cap is hit', async () => {
    process.env.GLOBAL_OPUS_CALLS_PER_DAY = '1';
    mockGenerateOpus.mockResolvedValue({
      ok: true,
      prompt: 'OPUS',
      usage: { input_tokens: 10, output_tokens: 20 },
    });
    const first = await runPipeline(inputs);
    expect(first.generator).toBe('opus'); // 1st call reserves the only slot
    const second = await runPipeline(inputs);
    expect(second.generator).toBe('deterministic'); // in-memory backstop blocks
    expect(second.fallbackReason).toBe('budget-exhausted');
    expect(mockGenerateOpus).toHaveBeenCalledTimes(1);
  });
});
