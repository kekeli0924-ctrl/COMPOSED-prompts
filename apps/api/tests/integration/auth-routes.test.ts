import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { auth } from '@/routes/auth';
import { sessionMiddleware } from '@/middleware/session';
import { db, schema } from '@/lib/db';
import { resetAllTables } from '../setup';

const makeApp = (): Hono => {
  const app = new Hono();
  app.use('*', sessionMiddleware);
  app.route('/', auth);
  return app;
};

const post = (app: Hono, path: string, body: unknown, cookie?: string): Promise<Response> =>
  app.request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });

describe('auth routes', () => {
  beforeEach(async () => {
    await resetAllTables();
  });

  it('POST /api/auth/signup creates user + returns session cookie', async () => {
    const res = await post(makeApp(), '/api/auth/signup', { email: 'a@test.com', password: 'longenough123' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe('a@test.com');
    expect(res.headers.get('set-cookie')).toMatch(/composed-prompts-session=/);
    const users = await db.select().from(schema.users);
    expect(users.length).toBe(1);
  });

  it('POST /api/auth/signup rejects short password', async () => {
    const res = await post(makeApp(), '/api/auth/signup', { email: 'a@test.com', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('POST /api/auth/signup rejects duplicate email', async () => {
    await post(makeApp(), '/api/auth/signup', { email: 'a@test.com', password: 'longenough123' });
    const res = await post(makeApp(), '/api/auth/signup', { email: 'a@test.com', password: 'differentpw1' });
    expect(res.status).toBe(409);
  });

  it('POST /api/auth/login validates + returns cookie', async () => {
    await post(makeApp(), '/api/auth/signup', { email: 'a@test.com', password: 'longenough123' });
    const res = await post(makeApp(), '/api/auth/login', { email: 'a@test.com', password: 'longenough123' });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/composed-prompts-session=/);
  });

  it('POST /api/auth/login rejects wrong password', async () => {
    await post(makeApp(), '/api/auth/signup', { email: 'a@test.com', password: 'longenough123' });
    const res = await post(makeApp(), '/api/auth/login', { email: 'a@test.com', password: 'wrong-password-1' });
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/logout clears session', async () => {
    const signup = await post(makeApp(), '/api/auth/signup', { email: 'a@test.com', password: 'longenough123' });
    const cookie = signup.headers.get('set-cookie')!.split(';')[0]!;
    const res = await post(makeApp(), '/api/auth/logout', {}, cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/);
  });
});
