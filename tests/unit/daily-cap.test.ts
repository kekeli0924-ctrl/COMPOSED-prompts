import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const originalEnv = process.env.DAILY_BUDGET_CEILING_USD;

describe('daily budget cap', () => {
  beforeEach(() => {
    process.env.DAILY_BUDGET_CEILING_USD = '0.10';
    vi.resetModules();
  });

  afterEach(() => {
    process.env.DAILY_BUDGET_CEILING_USD = originalEnv;
  });

  it('allows spend when under ceiling', async () => {
    const { budgetAvailable, recordSpend } = await import('@/lib/budget/daily-cap');
    expect(await budgetAvailable()).toBe(true);
    await recordSpend(0.05);
    expect(await budgetAvailable()).toBe(true);
  });

  it('blocks once ceiling is exceeded', async () => {
    const { budgetAvailable, recordSpend } = await import('@/lib/budget/daily-cap');
    await recordSpend(0.11);
    expect(await budgetAvailable()).toBe(false);
  });

  it('fails open if KV errors', async () => {
    const { budgetAvailable } = await import('@/lib/budget/daily-cap');
    expect(await budgetAvailable()).toBe(true);
  });
});
