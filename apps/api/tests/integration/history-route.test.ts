import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';

vi.mock('@/lib/pipeline', () => ({
  runPipeline: vi.fn().mockResolvedValue({
    prompt: 'test prompt',
    promptHash: 'a'.repeat(64),
    generator: 'opus',
  }),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkAndRecord: vi.fn().mockResolvedValue({ allowed: true, remaining: 19 }),
}));

import { me } from '@/routes/me';
import { auth } from '@/routes/auth';
import { generate } from '@/routes/generate';
import { sessionMiddleware } from '@/middleware/session';
import { resetAllTables } from '../setup';

const makeApp = (): Hono => {
  const a = new Hono();
  a.use('*', sessionMiddleware);
  a.route('/', auth);
  a.route('/', generate);
  a.route('/', me);
  return a;
};

const validInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'science-astronomy-ii',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-15',
  hoursAvailable: 2,
};

describe('GET /api/me/history', () => {
  beforeEach(async () => {
    await resetAllTables();
  });

  it('returns 401 when anonymous', async () => {
    const res = await makeApp().request('/api/me/history');
    expect(res.status).toBe(401);
  });

  it('returns empty list for new user', async () => {
    const app = makeApp();
    const signup = await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'h@test.com', password: 'longenough123' }),
    });
    const cookie = signup.headers.get('set-cookie')!.split(';')[0]!;
    const res = await app.request('/api/me/history', { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns entries newest-first', async () => {
    const app = makeApp();
    const signup = await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'h@test.com', password: 'longenough123' }),
    });
    const cookie = signup.headers.get('set-cookie')!.split(';')[0]!;
    // Generate 3 prompts
    for (let i = 0; i < 3; i++) {
      await app.request('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', cookie },
        body: JSON.stringify(validInputs),
      });
      await new Promise((r) => setTimeout(r, 10));  // ensure distinct created_at
    }
    const res = await app.request('/api/me/history', { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries.length).toBe(3);
    expect(body.total).toBe(3);
    expect(new Date(body.entries[0].createdAt).getTime())
      .toBeGreaterThan(new Date(body.entries[2].createdAt).getTime());
  });

  it('does not return other users entries', async () => {
    const app = makeApp();
    // User A
    const signupA = await app.request('/api/auth/signup', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@test.com', password: 'longenough123' }),
    });
    const cookieA = signupA.headers.get('set-cookie')!.split(';')[0]!;
    await app.request('/api/generate', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieA, 'x-forwarded-for': '1.1.1.1' },
      body: JSON.stringify(validInputs),
    });
    // User B
    const signupB = await app.request('/api/auth/signup', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'b@test.com', password: 'longenough123' }),
    });
    const cookieB = signupB.headers.get('set-cookie')!.split(';')[0]!;
    const res = await app.request('/api/me/history', { headers: { cookie: cookieB } });
    const body = await res.json();
    expect(body.entries.length).toBe(0);
  });
});
