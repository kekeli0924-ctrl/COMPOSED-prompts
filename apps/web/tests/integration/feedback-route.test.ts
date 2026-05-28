import { describe, it, expect } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/feedback/route';

const validBody = {
  promptHash: 'a'.repeat(64),
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  mode: 'cram-review',
  courseId: 'arts-acting-and-improv',
  rating: 4,
};

const makeReq = (body: unknown): NextRequest =>
  new NextRequest('http://localhost/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/feedback', () => {
  it('accepts a valid feedback payload', async () => {
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
  });

  it('rejects invalid hash', async () => {
    const res = await POST(makeReq({ ...validBody, promptHash: 'short' }));
    expect(res.status).toBe(400);
  });

  it('rejects rating outside 1-5', async () => {
    const res = await POST(makeReq({ ...validBody, rating: 99 }));
    expect(res.status).toBe(400);
  });

  it('returns 200 even if KV is unavailable (fail open)', async () => {
    const res = await POST(makeReq({ ...validBody, text: 'really helped' }));
    expect(res.status).toBe(200);
  });
});
