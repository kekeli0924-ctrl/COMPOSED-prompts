import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { me } from '@/routes/me';
import { withUser } from '../helpers/with-user';
import { db, schema } from '@/lib/db';
import { resetAllTables } from '../setup';

const seedUser = async () => {
  const [u] = await db
    .insert(schema.users)
    .values({ email: 'me@test.com', clerkUserId: 'clerk_me', displayName: 'Me' })
    .returning({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName });
  return u!;
};

describe('GET /api/me', () => {
  beforeEach(async () => {
    await resetAllTables();
  });

  it('returns user: null when anonymous', async () => {
    const app = new Hono();
    app.use('*', withUser(null));
    app.route('/', me);
    const res = await app.request('/api/me');
    expect(res.status).toBe(200);
    expect((await res.json()).user).toBeNull();
  });

  it('returns user + null profileSummary when authed without profile', async () => {
    const u = await seedUser();
    const app = new Hono();
    app.use('*', withUser({ id: u.id, email: u.email, displayName: u.displayName }));
    app.route('/', me);
    const res = await app.request('/api/me');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe('me@test.com');
    expect(body.profileSummary).toBeNull();
  });

  it('GET /api/me returns the grade for a user with a grad year', async () => {
    const [u] = await db
      .insert(schema.users)
      .values({ email: 'g@test.com', clerkUserId: 'clerk_g', displayName: null, gradYear: 2029 })
      .returning({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName });
    const app = new Hono();
    app.use('*', withUser({ id: u!.id, email: u!.email, displayName: u!.displayName, gradYear: 2029 }));
    app.route('/', me);
    const res = await app.request('/api/me');
    const body = await res.json();
    expect(body.gradYear).toBe(2029);
    expect(body.grade).toBe('Sophomore');
  });

  it('PATCH /api/me/grade sets the grade (and 401 when anonymous)', async () => {
    const [u] = await db
      .insert(schema.users)
      .values({ email: 'p@test.com', clerkUserId: 'clerk_p', displayName: null })
      .returning({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName });

    const anon = new Hono();
    anon.use('*', withUser(null));
    anon.route('/', me);
    expect((await anon.request('/api/me/grade', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(401);

    const app = new Hono();
    app.use('*', withUser({ id: u!.id, email: u!.email, displayName: u!.displayName, gradYear: null }));
    app.route('/', me);
    const res = await app.request('/api/me/grade', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grade: 'Senior' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).grade).toBe('Senior');
    const [reloaded] = await db.select().from(schema.users).where(eq(schema.users.id, u!.id));
    expect(reloaded!.gradYear).toBe(2027);
  });
});
