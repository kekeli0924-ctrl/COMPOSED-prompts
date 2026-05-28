import { describe, it, expect } from 'vitest';
import { hashIp } from '@/lib/ip-hash';

describe('hashIp', () => {
  it('returns a 64-char hex string', () => {
    expect(hashIp('1.2.3.4')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is stable for same IP', () => {
    expect(hashIp('1.2.3.4')).toBe(hashIp('1.2.3.4'));
  });

  it('differs for different IPs', () => {
    expect(hashIp('1.2.3.4')).not.toBe(hashIp('1.2.3.5'));
  });
});
