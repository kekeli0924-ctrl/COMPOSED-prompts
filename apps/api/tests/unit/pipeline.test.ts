import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { WizardInputs } from '@composed-prompts/shared';

const { mockGenerateOpus, mockGenerateModel, mockBudgetCheck, mockBudgetRecord, mockCheckAndRecord, mockFindUsableRecap } = vi.hoisted(() => ({
  mockGenerateOpus: vi.fn(),
  mockGenerateModel: vi.fn(),
  mockBudgetCheck: vi.fn(),
  mockBudgetRecord: vi.fn(),
  mockCheckAndRecord: vi.fn(),
  mockFindUsableRecap: vi.fn(),
}));

vi.mock('@composed-prompts/shared/src/generation/opus-full-prompt.js', () => ({
  generateFullPromptWithOpus: mockGenerateOpus,
  generateFullPromptWithModel: mockGenerateModel,
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
    mockGenerateModel.mockReset();
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

  it('falls back to deterministic when BOTH the Opus DB cap and the Sonnet cap are exceeded', async () => {
    // Since Phase 3 an opus cap block engages the Sonnet tier — so cap both.
    mockCheckAndRecord.mockImplementation(async (key: string) =>
      String(key).startsWith('global:') ? { allowed: false, remaining: 0 } : { allowed: true, remaining: 100 },
    );
    const r = await runPipeline(inputs);
    expect(r.generator).toBe('deterministic');
    expect(r.fallbackReason).toBe('budget-exhausted');
    expect(mockGenerateOpus).not.toHaveBeenCalled();
    expect(mockGenerateModel).not.toHaveBeenCalled();
  });

  it('falls back to deterministic once the in-memory cap is hit and sonnet is also capped', async () => {
    process.env.GLOBAL_OPUS_CALLS_PER_DAY = '1';
    mockGenerateOpus.mockResolvedValue({
      ok: true,
      prompt: 'OPUS',
      usage: { input_tokens: 10, output_tokens: 20 },
    });
    mockCheckAndRecord.mockImplementation(async (key: string) =>
      String(key).startsWith('global:sonnet') ? { allowed: false, remaining: 0 } : { allowed: true, remaining: 100 },
    );
    const first = await runPipeline(inputs);
    expect(first.generator).toBe('opus'); // 1st call reserves the only slot
    const second = await runPipeline(inputs);
    expect(second.generator).toBe('deterministic'); // in-memory backstop blocks; sonnet capped
    expect(second.fallbackReason).toBe('budget-exhausted');
    expect(mockGenerateOpus).toHaveBeenCalledTimes(1);
    expect(mockGenerateModel).not.toHaveBeenCalled();
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

describe('runPipeline — Sonnet middle tier decision matrix', () => {
  const OK_RESULT = { ok: true, prompt: 'MODEL PROMPT', usage: { input_tokens: 10, output_tokens: 20 } };

  // checkAndRecord answers by bucket key: opus/sonnet caps are independently steerable.
  const setCaps = (opus: boolean, sonnet: boolean): void => {
    mockCheckAndRecord.mockImplementation(async (key: string) =>
      key.startsWith('global:opus')
        ? { allowed: opus, remaining: 0 }
        : key.startsWith('global:sonnet')
          ? { allowed: sonnet, remaining: 0 }
          : { allowed: true, remaining: 100 },
    );
  };

  beforeEach(() => {
    mockGenerateOpus.mockReset();
    mockGenerateModel.mockReset();
    mockBudgetCheck.mockReset();
    mockBudgetRecord.mockReset();
    mockCheckAndRecord.mockReset();
    mockFindUsableRecap.mockReset();
    mockBudgetCheck.mockResolvedValue(true);
    mockBudgetRecord.mockResolvedValue(undefined);
    mockFindUsableRecap.mockResolvedValue(null);
    mockGenerateOpus.mockResolvedValue(OK_RESULT);
    mockGenerateModel.mockResolvedValue(OK_RESULT);
    setCaps(true, true);
    __resetGlobalOpusCounter();
    delete process.env.GLOBAL_OPUS_CALLS_PER_DAY;
    delete process.env.SONNET_MODEL;
  });

  it('opus OK → opus generates; sonnet is never attempted', async () => {
    const r = await runPipeline(inputs);
    expect(r.generator).toBe('opus');
    expect(mockGenerateModel).not.toHaveBeenCalled();
    expect(mockCheckAndRecord.mock.calls.some(([k]) => String(k).startsWith('global:sonnet'))).toBe(false);
  });

  it('opus DB-capped + budget OK → sonnet runs with opus-capped recorded and spend tracked', async () => {
    setCaps(false, true);
    const r = await runPipeline(inputs);
    expect(r.generator).toBe('sonnet');
    expect(r.fallbackReason).toBe('opus-capped');
    expect(r.prompt).toBe('MODEL PROMPT');
    expect(mockGenerateOpus).not.toHaveBeenCalled();
    expect(mockGenerateModel.mock.calls[0]![0]).toBe('claude-sonnet-4-6'); // default model
    expect(mockBudgetRecord).toHaveBeenCalled(); // sonnet spend recorded
    // Sonnet's own cap is fail-closed like the opus DB cap.
    const sonnetCall = mockCheckAndRecord.mock.calls.find(([k]) => String(k).startsWith('global:sonnet'));
    expect(sonnetCall![1]).toMatchObject({ limit: 500, windowSeconds: 86400, failClosed: true });
  });

  it('opus capped via the IN-MEMORY slot also unlocks sonnet (either cap counts)', async () => {
    process.env.GLOBAL_OPUS_CALLS_PER_DAY = '1';
    await runPipeline(inputs); // consumes the only in-memory opus slot
    mockGenerateModel.mockClear();
    const r = await runPipeline(inputs);
    expect(r.generator).toBe('sonnet');
    expect(mockGenerateModel).toHaveBeenCalledTimes(1);
  });

  it('budget exhausted → deterministic; sonnet is NOT consulted (budget is the hard stop)', async () => {
    mockBudgetCheck.mockResolvedValueOnce(false);
    const r = await runPipeline(inputs);
    expect(r.generator).toBe('deterministic');
    expect(r.fallbackReason).toBe('budget-exhausted');
    expect(mockGenerateModel).not.toHaveBeenCalled();
    expect(mockCheckAndRecord.mock.calls.some(([k]) => String(k).startsWith('global:sonnet'))).toBe(false);
  });

  it('opus capped + sonnet capped → deterministic with budget-exhausted', async () => {
    setCaps(false, false);
    const r = await runPipeline(inputs);
    expect(r.generator).toBe('deterministic');
    expect(r.fallbackReason).toBe('budget-exhausted');
    expect(mockGenerateModel).not.toHaveBeenCalled();
  });

  it('sonnet API error → deterministic with api-error', async () => {
    setCaps(false, true);
    mockGenerateModel.mockResolvedValueOnce({ ok: false, error: 'api-error' });
    const r = await runPipeline(inputs);
    expect(r.generator).toBe('deterministic');
    expect(r.fallbackReason).toBe('api-error');
  });

  it('opus API ERROR (not a cap) → deterministic, never sonnet', async () => {
    mockGenerateOpus.mockResolvedValueOnce({ ok: false, error: 'api-error' });
    const r = await runPipeline(inputs);
    expect(r.generator).toBe('deterministic');
    expect(r.fallbackReason).toBe('api-error');
    expect(mockGenerateModel).not.toHaveBeenCalled();
  });

  it('the recap rides the sonnet path too (usedRecap on sonnet success)', async () => {
    setCaps(false, true);
    mockFindUsableRecap.mockResolvedValueOnce({
      id: 'recap-uuid-2',
      createdAt: new Date('2026-06-08T12:00:00Z'),
      weakSpotsJson: ['weak spot'],
      recapText: 'raw',
    });
    const r = await runPipeline(inputs, { userId: '00000000-0000-0000-0000-000000000001' });
    expect(r.generator).toBe('sonnet');
    expect(r.usedRecap).toEqual({ id: 'recap-uuid-2', createdAt: '2026-06-08T12:00:00.000Z' });
    expect(mockGenerateModel.mock.calls[0]![5]).toContain('<last_session_recap'); // recapContext arg
  });

  it('respects SONNET_MODEL override', async () => {
    process.env.SONNET_MODEL = 'claude-sonnet-4-7';
    setCaps(false, true);
    const r = await runPipeline(inputs);
    expect(r.generator).toBe('sonnet');
    expect(mockGenerateModel.mock.calls[0]![0]).toBe('claude-sonnet-4-7');
    delete process.env.SONNET_MODEL;
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
