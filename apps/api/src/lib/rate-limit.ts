import { db, schema } from './db.js';
import { and, eq, gte, sql } from 'drizzle-orm';

export type RateLimitOptions = {
  limit: number;
  windowSeconds: number;
  // When true, a DB error DENIES the request (fail closed) instead of allowing
  // it (the default fail-open). Use for money-protecting global caps so a DB
  // outage / contention under a flood can't silently lift the ceiling.
  failClosed?: boolean;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
};

export async function checkAndRecord(
  bucketKey: string,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  try {
    const windowStart = new Date(Date.now() - opts.windowSeconds * 1000);

    // Count entries within the window
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.rateLimitLog)
      .where(
        and(
          eq(schema.rateLimitLog.bucketKey, bucketKey),
          gte(schema.rateLimitLog.occurredAt, windowStart),
        ),
      );
    const count = countRow?.count ?? 0;

    if (count >= opts.limit) {
      return { allowed: false, remaining: 0 };
    }

    // Record this request
    await db.insert(schema.rateLimitLog).values({ bucketKey });

    return { allowed: true, remaining: opts.limit - count - 1 };
  } catch (err) {
    console.error('[rate-limit] failure', {
      bucketKey,
      failClosed: Boolean(opts.failClosed),
      message: err instanceof Error ? err.message : String(err),
    });
    return opts.failClosed ? { allowed: false, remaining: 0 } : { allowed: true, remaining: opts.limit };
  }
}

// Periodic prune helper
export async function pruneOldRateLimitEntries(olderThanSeconds: number): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanSeconds * 1000);
  const result = await db
    .delete(schema.rateLimitLog)
    .where(sql`${schema.rateLimitLog.occurredAt} < ${cutoff}`)
    .returning({ id: schema.rateLimitLog.id });
  return result.length;
}
