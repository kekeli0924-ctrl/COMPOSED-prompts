import { describe, it, expect } from 'vitest';
import { checkAndRecord } from '@/lib/rate-limit/sliding-window';

describe('rate limit sliding window', () => {
  it('allows first request', async () => {
    const result = await checkAndRecord('ip-1', { limit: 5, windowSeconds: 60 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('blocks after limit', async () => {
    for (let i = 0; i < 5; i++) {
      await checkAndRecord('ip-2', { limit: 5, windowSeconds: 60 });
    }
    const result = await checkAndRecord('ip-2', { limit: 5, windowSeconds: 60 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('fails open if KV errors', async () => {
    const result = await checkAndRecord('ip-3', { limit: 5, windowSeconds: 60 });
    expect(result.allowed).toBe(true);
  });
});
