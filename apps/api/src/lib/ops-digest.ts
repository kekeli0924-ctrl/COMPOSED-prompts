import { gte, inArray, sql } from 'drizzle-orm';
import { db, schema } from './db.js';

export type OpsDigest = {
  windowHours: number;
  generations: {
    total: number;
    byGenerator: Record<string, number>;
    byFallbackReason: Record<string, number>;
  };
  spend: { todayUsd: number; yesterdayUsd: number };
  feedback: { count: number; avgRating: number | null };
  recapsSubmitted: number; // COUNT only — see invariant note below
  newUsers: number;
};

const utcDay = (d: Date): string =>
  `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;

// Build a COUNTS-ONLY operational digest of the last 24h. Reads NO user content:
// generations/feedback are aggregated (never their prompt/text bodies), and recaps are
// touched by a `count(*)` ONLY — never `recap_text` — so the personal-only recap
// invariant holds (aggregate count, no content, no cross-user row data). `now` is
// injectable for tests.
export async function buildDigest(now: Date = new Date()): Promise<OpsDigest> {
  const windowHours = 24;
  const cutoff = new Date(now.getTime() - windowHours * 60 * 60 * 1000);

  const genRows = await db
    .select({
      generator: schema.generations.generator,
      fallbackReason: schema.generations.fallbackReason,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.generations)
    .where(gte(schema.generations.createdAt, cutoff))
    .groupBy(schema.generations.generator, schema.generations.fallbackReason);

  const byGenerator: Record<string, number> = {};
  const byFallbackReason: Record<string, number> = {};
  let total = 0;
  for (const r of genRows) {
    total += r.count;
    byGenerator[r.generator] = (byGenerator[r.generator] ?? 0) + r.count;
    const fr = r.fallbackReason ?? 'none';
    byFallbackReason[fr] = (byFallbackReason[fr] ?? 0) + r.count;
  }

  const today = utcDay(now);
  const yesterday = utcDay(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  const spendRows = await db
    .select({ day: schema.dailySpend.day, usd: schema.dailySpend.cumulativeUsd })
    .from(schema.dailySpend)
    .where(inArray(schema.dailySpend.day, [today, yesterday]));
  const spendByDay: Record<string, number> = {};
  for (const r of spendRows) spendByDay[r.day] = parseFloat(r.usd);

  const [fb] = await db
    .select({ count: sql<number>`count(*)::int`, avg: sql<string | null>`avg(${schema.feedback.rating})` })
    .from(schema.feedback)
    .where(gte(schema.feedback.createdAt, cutoff));

  // COUNT only — never selects recap_text (personal-only invariant).
  const [recap] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.recaps)
    .where(gte(schema.recaps.createdAt, cutoff));

  const [users] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.users)
    .where(gte(schema.users.createdAt, cutoff));

  return {
    windowHours,
    generations: { total, byGenerator, byFallbackReason },
    spend: { todayUsd: spendByDay[today] ?? 0, yesterdayUsd: spendByDay[yesterday] ?? 0 },
    feedback: { count: fb?.count ?? 0, avgRating: fb?.avg != null ? Number(fb.avg) : null },
    recapsSubmitted: recap?.count ?? 0,
    newUsers: users?.count ?? 0,
  };
}

export function formatDigest(d: OpsDigest): string {
  const fmt = (m: Record<string, number>): string =>
    Object.entries(m).map(([k, v]) => `${k}:${v}`).join(' ') || 'none';
  return [
    `Composed daily digest (last ${d.windowHours}h)`,
    `generations: ${d.generations.total} (generator ${fmt(d.generations.byGenerator)}; fallback ${fmt(d.generations.byFallbackReason)})`,
    `spend USD: today ${d.spend.todayUsd.toFixed(2)}, yesterday ${d.spend.yesterdayUsd.toFixed(2)}`,
    `feedback: ${d.feedback.count}${d.feedback.avgRating != null ? ` (avg ${d.feedback.avgRating.toFixed(2)})` : ''}`,
    `recaps submitted: ${d.recapsSubmitted}`,
    `new users: ${d.newUsers}`,
  ].join('\n');
}

// POST the digest to OPS_WEBHOOK_URL if set (Discord-compatible `{ content }`). A missing
// URL or a post failure is swallowed — observability must never fail the maintenance job.
export async function postDigest(summary: string): Promise<void> {
  const url = process.env.OPS_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: summary }),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    console.error('[ops-digest] webhook post failed (non-fatal)', {
      message: err instanceof Error ? err.message : String(err),
    });
  }
}
