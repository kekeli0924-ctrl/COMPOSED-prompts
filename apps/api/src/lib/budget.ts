import { db, schema } from './db.js';
import { sql } from 'drizzle-orm';

const todayKey = (): string => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

const ceiling = (): number => {
  const raw = process.env.DAILY_BUDGET_CEILING_USD;
  if (!raw) return 10.0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 10.0;
};

export async function budgetAvailable(): Promise<boolean> {
  try {
    const day = todayKey();
    const [row] = await db.select().from(schema.dailySpend).where(sql`${schema.dailySpend.day} = ${day}`);
    const spent = row ? parseFloat(row.cumulativeUsd) : 0;
    return spent < ceiling();
  } catch (err) {
    console.error('[budget] check failed, failing open', { message: err instanceof Error ? err.message : String(err) });
    return true;
  }
}

export async function recordSpend(usd: number): Promise<void> {
  try {
    const day = todayKey();
    await db
      .insert(schema.dailySpend)
      .values({ day, cumulativeUsd: String(usd) })
      .onConflictDoUpdate({
        target: schema.dailySpend.day,
        set: {
          cumulativeUsd: sql`${schema.dailySpend.cumulativeUsd} + ${String(usd)}::numeric`,
          updatedAt: sql`now()`,
        },
      });
  } catch (err) {
    console.error('[budget] record failed (silently dropped)', { message: err instanceof Error ? err.message : String(err) });
  }
}

// Test helper — clears all spend
export async function resetForTests(): Promise<void> {
  await db.delete(schema.dailySpend);
}
