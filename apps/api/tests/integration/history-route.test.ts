import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { me } from '@/routes/me';
import { generate } from '@/routes/generate';
import { withUser } from '../helpers/with-user';
import { db, schema } from '@/lib/db';
import { resetAllTables } from '../setup';

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

type U = { id: string; email: string; displayName: string | null };

const seedUser = async (email: string, clerkUserId: string): Promise<U> => {
  const [u] = await db
    .insert(schema.users)
    .values({ email, clerkUserId, displayName: null })
    .returning({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName });
  return u!;
};

const appFor = (user: U | null) => {
  const a = new Hono();
  a.use('*', withUser(user));
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

const gen = (app: Hono) =>
  app.request('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(validInputs),
  });

describe('GET /api/me/history', () => {
  beforeEach(async () => {
    await resetAllTables();
  });

  it('returns 401 when anonymous', async () => {
    const res = await appFor(null).request('/api/me/history');
    expect(res.status).toBe(401);
  });

  it('returns empty list for a new user', async () => {
    const u = await seedUser('h@test.com', 'clerk_h');
    const res = await appFor(u).request('/api/me/history');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns entries newest-first', async () => {
    const u = await seedUser('h@test.com', 'clerk_h');
    const app = appFor(u);
    for (let i = 0; i < 3; i++) {
      await gen(app);
      await new Promise((r) => setTimeout(r, 10));
    }
    const res = await app.request('/api/me/history');
    const body = await res.json();
    expect(body.entries.length).toBe(3);
    expect(body.total).toBe(3);
    expect(new Date(body.entries[0].createdAt).getTime()).toBeGreaterThan(
      new Date(body.entries[2].createdAt).getTime(),
    );
    const entry = body.entries[0];
    expect(entry.assessmentType).toBe('test');
    expect(entry.assessmentDate).toBe('2026-06-15');
  });

  it('does not return other users entries', async () => {
    const a = await seedUser('a@test.com', 'clerk_a');
    const b = await seedUser('b@test.com', 'clerk_b');
    await gen(appFor(a));
    const res = await appFor(b).request('/api/me/history');
    const body = await res.json();
    expect(body.entries.length).toBe(0);
  });
});
