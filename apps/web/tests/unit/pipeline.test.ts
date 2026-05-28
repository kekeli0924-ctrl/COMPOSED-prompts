import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WizardInputs } from '@composed-prompts/shared';

const { mockGenerateFullPromptWithOpus, mockBudgetCheck, mockBudgetRecord } = vi.hoisted(() => ({
  mockGenerateFullPromptWithOpus: vi.fn(),
  mockBudgetCheck: vi.fn(),
  mockBudgetRecord: vi.fn(),
}));

vi.mock('@composed-prompts/shared', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@composed-prompts/shared')>();
  return {
    ...actual,
    generateFullPromptWithOpus: mockGenerateFullPromptWithOpus,
  };
});

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
    mockGenerateFullPromptWithOpus.mockReset();
    mockBudgetCheck.mockReset();
    mockBudgetRecord.mockReset();
    mockBudgetCheck.mockResolvedValue(true);
    mockBudgetRecord.mockResolvedValue(undefined);
  });

  it('uses Opus output when budget allows + API succeeds', async () => {
    const opusPrompt = '<role>You are a patient tutor for acting...</role>\n<about_me>I am a Pomfret student...</about_me>';
    mockGenerateFullPromptWithOpus.mockResolvedValueOnce({
      ok: true,
      prompt: opusPrompt,
      usage: { input_tokens: 500, output_tokens: 800 },
    });
    const result = await runPipeline(inputs);
    expect(result.metadata.generator).toBe('opus');
    expect(result.metadata.fallbackReason).toBeUndefined();
    expect(result.prompt).toBe(opusPrompt);
    expect(result.metadata.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(mockBudgetRecord).toHaveBeenCalled();
  });

  it('falls back to deterministic when budget exhausted; does not call Opus', async () => {
    mockBudgetCheck.mockResolvedValueOnce(false);
    const result = await runPipeline(inputs);
    expect(result.metadata.generator).toBe('deterministic');
    expect(result.metadata.fallbackReason).toBe('budget-exhausted');
    expect(mockGenerateFullPromptWithOpus).not.toHaveBeenCalled();
    expect(result.metadata.promptHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('falls back to deterministic when Opus errors', async () => {
    mockGenerateFullPromptWithOpus.mockResolvedValueOnce({ ok: false, error: 'api-error' });
    const result = await runPipeline(inputs);
    expect(result.metadata.generator).toBe('deterministic');
    expect(result.metadata.fallbackReason).toBe('api-error');
    expect(mockBudgetRecord).not.toHaveBeenCalled();
  });

  it('returns a deterministic prompt with interaction-style fallback when Opus unavailable', async () => {
    mockBudgetCheck.mockResolvedValueOnce(false);
    const result = await runPipeline(inputs);
    expect(result.prompt).toMatch(/Interaction style:/);
    expect(result.prompt.length).toBeGreaterThan(200);
  });

  it('prompt hash is a 64-char hex digest', async () => {
    mockGenerateFullPromptWithOpus.mockResolvedValueOnce({
      ok: true,
      prompt: 'hello',
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    const result = await runPipeline(inputs);
    expect(result.metadata.promptHash).toMatch(/^[a-f0-9]{64}$/);
  });
});
