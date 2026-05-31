import { describe, it, expect, beforeEach, vi } from 'vitest';
import { budgetAvailable, recordSpend, resetForTests } from '@/lib/budget';
import { db } from '@/lib/db';

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

  it('fails CLOSED (returns false) when the DB query throws', async () => {
    const spy = vi.spyOn(db, 'select').mockImplementation(() => {
      throw new Error('db down');
    });
    expect(await budgetAvailable()).toBe(false);
    spy.mockRestore();
  });
});
