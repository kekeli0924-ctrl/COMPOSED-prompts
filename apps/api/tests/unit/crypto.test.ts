import { describe, it, expect, beforeEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptToken, decryptToken } from '@/lib/crypto';

describe('crypto', () => {
  beforeEach(() => { process.env.CANVAS_TOKEN_KEY = randomBytes(32).toString('base64'); });

  it('round-trips and does not leak plaintext', () => {
    const blob = encryptToken('secret~token~123');
    expect(blob).not.toContain('secret~token~123');
    expect(decryptToken(blob)).toBe('secret~token~123');
  });
  it('uses distinct IVs per call', () => {
    expect(encryptToken('x')).not.toBe(encryptToken('x'));
  });
  it('throws on a tampered blob', () => {
    const [iv, tag] = encryptToken('y').split(':');
    const tampered = [iv, tag, Buffer.from('garbage').toString('base64')].join(':');
    expect(() => decryptToken(tampered)).toThrow();
  });
  it('throws when the key is missing', () => {
    delete process.env.CANVAS_TOKEN_KEY;
    expect(() => encryptToken('z')).toThrow();
  });
  it('throws when the key is not 32 bytes', () => {
    process.env.CANVAS_TOKEN_KEY = Buffer.from('short').toString('base64');
    expect(() => encryptToken('z')).toThrow();
  });
});
