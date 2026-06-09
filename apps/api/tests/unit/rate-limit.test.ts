import { describe, it, expect, beforeEach, vi } from 'vitest';
import { checkAndRecord, pruneOldRateLimitEntries } from '@/lib/rate-limit';
import { resetRateLimitLog } from '../setup';

describe('rate limit', () => {
  beforeEach(async () => {
    await resetRateLimitLog();
  });

  it('allows first request', async () => {
    const r = await checkAndRecord('ip:test-1', { limit: 5, windowSeconds: 60 });
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
  });

  it('blocks after limit', async () => {
    for (let i = 0; i < 5; i++) {
      await checkAndRecord('ip:test-2', { limit: 5, windowSeconds: 60 });
    }
    const r = await checkAndRecord('ip:test-2', { limit: 5, windowSeconds: 60 });
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it('counts only requests within window', async () => {
    const { db, schema } = await import('@/lib/db');
    const old = new Date(Date.now() - 120 * 1000); // 2 min ago
    await db.insert(schema.rateLimitLog).values({ bucketKey: 'ip:test-3', occurredAt: old });
    const r = await checkAndRecord('ip:test-3', { limit: 5, windowSeconds: 60 });
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4); // old row excluded
  });

  it('fails OPEN by default when the DB throws', async () => {
    const { db } = await import('@/lib/db');
    const spy = vi.spyOn(db, 'select').mockImplementation(() => {
      throw new Error('db down');
    });
    const r = await checkAndRecord('ip:err', { limit: 5, windowSeconds: 60 });
    expect(r.allowed).toBe(true);
    spy.mockRestore();
  });

  it('fails CLOSED when failClosed is set and the DB throws', async () => {
    const { db } = await import('@/lib/db');
    const spy = vi.spyOn(db, 'select').mockImplementation(() => {
      throw new Error('db down');
    });
    const r = await checkAndRecord('global:opus:x', { limit: 5, windowSeconds: 60, failClosed: true });
    expect(r.allowed).toBe(false);
    spy.mockRestore();
  });

  it('pruneOldRateLimitEntries deletes rows past the cutoff, keeping recent ones', async () => {
    const { db, schema } = await import('@/lib/db');
    const old = new Date(Date.now() - 49 * 60 * 60 * 1000);    // 49h ago — past 48h cutoff
    const recent = new Date(Date.now() - 1 * 60 * 60 * 1000);  // 1h ago — kept
    await db.insert(schema.rateLimitLog).values({ bucketKey: 'ip:prune-old', occurredAt: old });
    await db.insert(schema.rateLimitLog).values({ bucketKey: 'ip:prune-recent', occurredAt: recent });

    const deleted = await pruneOldRateLimitEntries(48 * 60 * 60);
    expect(deleted).toBe(1);

    const remaining = await db.select().from(schema.rateLimitLog);
    expect(remaining.some((r) => r.bucketKey === 'ip:prune-old')).toBe(false);
    expect(remaining.some((r) => r.bucketKey === 'ip:prune-recent')).toBe(true);
  });
});
