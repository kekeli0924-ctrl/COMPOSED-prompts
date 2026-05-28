import { kv } from '@/lib/kv';

const DAY_KEY = (): string => {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `budget:${yyyy}-${mm}-${dd}`;
};

const ceiling = (): number => {
  const raw = process.env.DAILY_BUDGET_CEILING_USD;
  if (!raw) return 5.0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 5.0;
};

export async function budgetAvailable(): Promise<boolean> {
  try {
    const client = await kv();
    const spent = (await client.get<number>(DAY_KEY())) ?? 0;
    return spent < ceiling();
  } catch {
    return true;
  }
}

export async function recordSpend(usd: number): Promise<void> {
  try {
    const client = await kv();
    await client.incrbyfloat(DAY_KEY(), usd);
    await client.expire(DAY_KEY(), 60 * 60 * 36); // 36h TTL = safe for day boundary
  } catch {
    // best effort
  }
}
