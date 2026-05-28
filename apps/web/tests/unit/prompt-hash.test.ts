import { describe, it, expect } from 'vitest';
import { promptHash } from '@/lib/storage/prompt-hash';

describe('promptHash', () => {
  it('returns a 64-char hex string', () => {
    expect(promptHash('hello')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is stable for same input', () => {
    expect(promptHash('abc')).toBe(promptHash('abc'));
  });

  it('differs for different input', () => {
    expect(promptHash('abc')).not.toBe(promptHash('abcd'));
  });
});
