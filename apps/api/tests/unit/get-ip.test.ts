import { describe, it, expect, vi } from 'vitest';
import { getIp } from '@/lib/get-ip';

const ctx = (headers: Record<string, string | undefined>) => ({
  req: { header: (k: string) => headers[k] },
});

describe('getIp', () => {
  it('prefers the unspoofable Fly-Client-IP', () => {
    expect(getIp(ctx({ 'fly-client-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('9.9.9.9');
  });

  it('falls back to the RIGHT-most x-forwarded-for entry (closest to the trusted edge)', () => {
    expect(getIp(ctx({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' }))).toBe('3.3.3.3');
  });

  it('falls back to x-real-ip', () => {
    expect(getIp(ctx({ 'x-real-ip': '4.4.4.4' }))).toBe('4.4.4.4');
  });

  it("returns 'unknown' when no forwarding headers are present", () => {
    expect(getIp(ctx({}))).toBe('unknown');
  });

  it("ignores client X-Forwarded-For in production when Fly-Client-IP is absent (no spoof)", () => {
    vi.stubEnv('NODE_ENV', 'production');
    expect(getIp(ctx({ 'x-forwarded-for': '6.6.6.6' }))).toBe('unknown');
    vi.unstubAllEnvs();
  });

  it('skips empty trailing X-Forwarded-For segments', () => {
    expect(getIp(ctx({ 'x-forwarded-for': '1.1.1.1, ' }))).toBe('1.1.1.1');
  });
});
