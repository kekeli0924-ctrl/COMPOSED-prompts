import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { me } from '@/routes/me';
import { auth } from '@/routes/auth';
import { sessionMiddleware } from '@/middleware/session';
import { resetAllTables } from '../setup';

const makeApp = (): Hono => {
  const app = new Hono();
  app.use('*', sessionMiddleware);
  app.route('/', auth);
  app.route('/', me);
  return app;
};

describe('GET /api/me', () => {
  beforeEach(async () => {
    await resetAllTables();
  });

  it('returns user: null when no session', async () => {
    const res = await makeApp().request('/api/me');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBeNull();
  });

  it('returns user when session valid', async () => {
    const app = makeApp();
    const signup = await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'me@test.com', password: 'longenough123' }),
    });
    const cookie = signup.headers.get('set-cookie')!.split(';')[0]!;
    const res = await app.request('/api/me', { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe('me@test.com');
    expect(body.profileSummary).toBeNull();
  });
});
