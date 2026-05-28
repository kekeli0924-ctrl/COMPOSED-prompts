import { describe, it, expect, beforeEach } from 'vitest';
import { checkAndRecord } from '@/lib/rate-limit';
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
});
