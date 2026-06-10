import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WizardInputs } from '@composed-prompts/shared';

const { mockGenerateOpus, mockBudgetCheck, mockBudgetRecord, mockCheckAndRecord, mockFindUsableRecap } = vi.hoisted(() => ({
  mockGenerateOpus: vi.fn(),
  mockBudgetCheck: vi.fn(),
  mockBudgetRecord: vi.fn(),
  mockCheckAndRecord: vi.fn(),
  mockFindUsableRecap: vi.fn(),
}));

vi.mock('@composed-prompts/shared/src/generation/opus-full-prompt.js', () => ({
  generateFullPromptWithOpus: mockGenerateOpus,
}));

vi.mock('@/lib/budget', () => ({
  budgetAvailable: mockBudgetCheck,
  recordSpend: mockBudgetRecord,
}));

vi.mock('@/lib/rate-limit', () => ({ checkAndRecord: mockCheckAndRecord }));

vi.mock('@/lib/recaps', () => ({ findUsableRecap: mockFindUsableRecap }));

import { runPipeline, reserveGlobalOpusSlot, __resetGlobalOpusCounter } from '@/lib/pipeline';

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
    mockFindUsableRecap.mockReset();
    mockFindUsableRecap.mockResolvedValue(null);
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
    expect(r.templateVersion).toBe('v2'); // instrumentation: opus path stamps the active version
    expect(r.prompt).toBe('OPUS-WRITTEN PROMPT');
    expect(r.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(mockBudgetRecord).toHaveBeenCalled();
    // The version passed to the generator must match the stamped version.
    expect(mockGenerateOpus.mock.calls[0]![3]).toBe('v2');
  });

  it('falls back to deterministic when budget exhausted', async () => {
    mockBudgetCheck.mockResolvedValueOnce(false);
    const r = await runPipeline(inputs);
    expect(r.generator).toBe('deterministic');
    expect(r.templateVersion).toBe('v2'); // instrumentation: deterministic fallback also stamps the active version
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

describe('runPipeline — stage-2 recap injection', () => {
  const RECAP = {
    id: 'recap-uuid-1',
    createdAt: new Date('2026-06-08T12:00:00Z'),
    weakSpotsJson: ['Confused mitosis with meiosis'],
    followUpPrompt: 'stored follow-up (must never be injected)',
    recapText: 'raw recap text',
  };

  beforeEach(() => {
    // Sibling describe — set up ALL mocks (no inheritance from the runPipeline block,
    // and the cap tests above leak env/counter state otherwise).
    mockGenerateOpus.mockReset();
    mockBudgetCheck.mockReset();
    mockBudgetRecord.mockReset();
    mockCheckAndRecord.mockReset();
    mockFindUsableRecap.mockReset();
    mockBudgetCheck.mockResolvedValue(true);
    mockBudgetRecord.mockResolvedValue(undefined);
    mockCheckAndRecord.mockResolvedValue({ allowed: true, remaining: 100 });
    mockFindUsableRecap.mockResolvedValue(null);
    __resetGlobalOpusCounter();
    delete process.env.GLOBAL_OPUS_CALLS_PER_DAY;
    mockGenerateOpus.mockResolvedValue({
      ok: true,
      prompt: 'OPUS PROMPT',
      usage: { input_tokens: 10, output_tokens: 20 },
    });
  });

  it('injects the delimited recap block and reports usedRecap (signed-in, catalog course)', async () => {
    mockFindUsableRecap.mockResolvedValueOnce(RECAP);
    const r = await runPipeline(inputs, { userId: '00000000-0000-0000-0000-000000000001' });
    expect(mockFindUsableRecap).toHaveBeenCalledWith('00000000-0000-0000-0000-000000000001', inputs.courseId);
    const recapArg = mockGenerateOpus.mock.calls[0]![4] as string;
    expect(recapArg).toContain('<last_session_recap untrusted="true">');
    expect(recapArg).toContain('- Confused mitosis with meiosis');
    expect(recapArg).not.toContain('stored follow-up'); // never the follow-up prompt
    expect(r.usedRecap).toEqual({ id: 'recap-uuid-1', createdAt: '2026-06-08T12:00:00.000Z' });
  });

  it('omits the recap when useRecap is false', async () => {
    await runPipeline({ ...inputs, useRecap: false }, { userId: '00000000-0000-0000-0000-000000000001' });
    expect(mockFindUsableRecap).not.toHaveBeenCalled();
    expect(mockGenerateOpus.mock.calls[0]![4]).toBe('');
  });

  it('omits the recap for anonymous users', async () => {
    await runPipeline(inputs); // no userId
    expect(mockFindUsableRecap).not.toHaveBeenCalled();
    expect(mockGenerateOpus.mock.calls[0]![4]).toBe('');
  });

  it('omits the recap for free-text courses (no catalog courseId)', async () => {
    await runPipeline({ ...inputs, courseId: null, courseFreeText: 'Independent study' }, { userId: '00000000-0000-0000-0000-000000000001' });
    expect(mockFindUsableRecap).not.toHaveBeenCalled();
    expect(mockGenerateOpus.mock.calls[0]![4]).toBe('');
  });

  it('omits the recap when none is usable (stale/expired/none)', async () => {
    mockFindUsableRecap.mockResolvedValueOnce(null);
    const r = await runPipeline(inputs, { userId: '00000000-0000-0000-0000-000000000001' });
    expect(mockGenerateOpus.mock.calls[0]![4]).toBe('');
    expect(r.usedRecap).toBeUndefined();
  });

  it('deterministic fallback never claims recap use and still stamps template_version', async () => {
    mockFindUsableRecap.mockResolvedValueOnce(RECAP);
    mockGenerateOpus.mockReset();
    mockGenerateOpus.mockResolvedValueOnce({ ok: false, error: 'api-error' });
    const r = await runPipeline(inputs, { userId: '00000000-0000-0000-0000-000000000001' });
    expect(r.generator).toBe('deterministic');
    expect(r.usedRecap).toBeUndefined(); // the produced prompt did not carry the recap
    expect(r.templateVersion).toBe('v2');
  });
});

describe('reserveGlobalOpusSlot — UTC-day rollover', () => {
  beforeEach(() => {
    __resetGlobalOpusCounter();
    process.env.GLOBAL_OPUS_CALLS_PER_DAY = '3';
  });
  afterEach(() => {
    delete process.env.GLOBAL_OPUS_CALLS_PER_DAY;
    __resetGlobalOpusCounter();
  });

  it('frees slots again after the UTC day rolls over (injected clock)', () => {
    const day1 = new Date('2026-06-08T12:00:00Z');
    expect(reserveGlobalOpusSlot(day1)).toBe(true);
    expect(reserveGlobalOpusSlot(day1)).toBe(true);
    expect(reserveGlobalOpusSlot(day1)).toBe(true);
    expect(reserveGlobalOpusSlot(day1)).toBe(false); // cap (3) hit on day 1

    const day2 = new Date('2026-06-09T00:05:00Z');
    expect(reserveGlobalOpusSlot(day2)).toBe(true);  // counter reset on the new UTC day
  });
});
