import { describe, it, expect, beforeEach } from 'vitest';
import { budgetAvailable, recordSpend, resetForTests } from '@/lib/budget';

describe('daily budget cap', () => {
  beforeEach(async () => {
    process.env.DAILY_BUDGET_CEILING_USD = '0.10';
    await resetForTests();
  });

  it('allows spend when under ceiling', async () => {
    expect(await budgetAvailable()).toBe(true);
    await recordSpend(0.05);
    expect(await budgetAvailable()).toBe(true);
  });

  it('blocks once ceiling exceeded', async () => {
    await recordSpend(0.11);
    expect(await budgetAvailable()).toBe(false);
  });

  it('accumulates spend within a day', async () => {
    await recordSpend(0.04);
    await recordSpend(0.04);
    expect(await budgetAvailable()).toBe(true);
    await recordSpend(0.04);
    expect(await budgetAvailable()).toBe(false);
  });
});
