import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { readFileSync } from 'node:fs';
import { eq, sql } from 'drizzle-orm';
import { withUser } from '../helpers/with-user';
import { db, schema } from '@/lib/db';
import { resetAllTables } from '../setup';

const { mockCheckAndRecord } = vi.hoisted(() => ({ mockCheckAndRecord: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkAndRecord: mockCheckAndRecord }));

import { outcome } from '@/routes/outcome';

type U = { id: string; email: string; displayName: string | null };

const daysAgo = (n: number): string => {
  const d = new Date(Date.now() - n * 86400000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

const seedUser = async (email: string, clerkUserId: string): Promise<U> => {
  const [u] = await db
    .insert(schema.users)
    .values({ email, clerkUserId, displayName: null })
    .returning({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName });
  return u!;
};

const seedGeneration = async (
  userId: string | null,
  opts: { courseId?: string | null; assessmentDate?: string | null; assessmentType?: string; createdAt?: Date } = {},
): Promise<string> => {
  const [g] = await db
    .insert(schema.generations)
    .values({
      userId,
      inputsJson: { assessmentType: opts.assessmentType ?? 'test', assessmentDate: opts.assessmentDate ?? undefined },
      promptText: 'p',
      promptHash: 'a'.repeat(64),
      generator: 'opus',
      courseId: opts.courseId === undefined ? 'science-adv-biology' : opts.courseId,
      mode: 'cram-review',
      provider: 'anthropic',
      model: 'claude-opus-4-8',
      templateVersion: 'v2',
      assessmentDate: opts.assessmentDate ?? null,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    })
    .returning({ id: schema.generations.id });
  return g!.id;
};

const appFor = (user: U | null): Hono => {
  const a = new Hono();
  a.use('*', withUser(user));
  a.route('/', outcome);
  return a;
};

const post = (app: Hono, body: unknown): Promise<Response> =>
  app.request('/api/outcome', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/outcome', () => {
  beforeEach(async () => {
    mockCheckAndRecord.mockReset();
    mockCheckAndRecord.mockResolvedValue({ allowed: true, remaining: 29 });
    await resetAllTables();
  });

  it('rejects anonymous callers with 401', async () => {
    const res = await post(appFor(null), { generationId: '00000000-0000-0000-0000-000000000000', outcome: 3 });
    expect(res.status).toBe(401);
  });

  it("returns 404 for another user's generation (ownership)", async () => {
    const a = await seedUser('a@test.com', 'clerk_a');
    const b = await seedUser('b@test.com', 'clerk_b');
    const genId = await seedGeneration(a.id);
    const res = await post(appFor(b), { generationId: genId, outcome: 4 });
    expect(res.status).toBe(404);
    expect(await db.select().from(schema.assessmentOutcomes)).toHaveLength(0);
  });

  it('rejects out-of-range outcomes with 400', async () => {
    const u = await seedUser('u@test.com', 'clerk_u');
    const genId = await seedGeneration(u.id);
    for (const bad of [0, 6, 2.5, '4']) {
      const res = await post(appFor(u), { generationId: genId, outcome: bad });
      expect(res.status, String(bad)).toBe(400);
    }
  });

  it('returns 429 when the per-user cap is hit', async () => {
    mockCheckAndRecord.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const u = await seedUser('u@test.com', 'clerk_u');
    const genId = await seedGeneration(u.id);
    const res = await post(appFor(u), { generationId: genId, outcome: 3 });
    expect(res.status).toBe(429);
  });

  it('stores the outcome and UPSERTS on revision (single row, latest value)', async () => {
    const u = await seedUser('u@test.com', 'clerk_u');
    const genId = await seedGeneration(u.id);

    const first = await post(appFor(u), { generationId: genId, outcome: 2 });
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true });

    const revised = await post(appFor(u), { generationId: genId, outcome: 4 });
    expect(revised.status).toBe(200);

    const rows = await db.select().from(schema.assessmentOutcomes);
    expect(rows).toHaveLength(1); // upsert, not a second row
    expect(rows[0]!.outcome).toBe(4);
    expect(rows[0]!.userId).toBe(u.id);
  });
});

describe('GET /api/me/pending-outcomes', () => {
  beforeEach(async () => {
    mockCheckAndRecord.mockReset();
    mockCheckAndRecord.mockResolvedValue({ allowed: true, remaining: 29 });
    await resetAllTables();
  });

  const get = (app: Hono): Promise<Response> => app.request('/api/me/pending-outcomes');

  it('rejects anonymous callers with 401', async () => {
    expect((await get(appFor(null))).status).toBe(401);
  });

  it('applies the date window: yesterday..14d ago in; today and 20d ago out', async () => {
    const u = await seedUser('u@test.com', 'clerk_u');
    await seedGeneration(u.id, { assessmentDate: daysAgo(1), courseId: 'science-adv-biology' });   // in
    await seedGeneration(u.id, { assessmentDate: daysAgo(14), courseId: 'mathematics-adv-calculus-i' }); // in (boundary)
    await seedGeneration(u.id, { assessmentDate: daysAgo(0), courseId: 'wellbeing-adv-psychology' });    // out (today)
    await seedGeneration(u.id, { assessmentDate: daysAgo(20), courseId: 'arts-acting-and-improv' });     // out (stale)
    await seedGeneration(u.id, { assessmentDate: null, courseId: 'english-eng-19th-century-russian-literature' }); // out (no date)

    const body = await (await get(appFor(u))).json();
    const dates = body.items.map((i: { assessmentDate: string }) => i.assessmentDate).sort();
    expect(body.items).toHaveLength(2);
    expect(dates).toEqual([daysAgo(14), daysAgo(1)].sort());
  });

  it('excludes generations that already have an outcome', async () => {
    const u = await seedUser('u@test.com', 'clerk_u');
    const done = await seedGeneration(u.id, { assessmentDate: daysAgo(2), courseId: 'science-adv-biology' });
    await db.insert(schema.assessmentOutcomes).values({ userId: u.id, generationId: done, outcome: 5 });
    await seedGeneration(u.id, { assessmentDate: daysAgo(3), courseId: 'mathematics-adv-calculus-i' });

    const body = await (await get(appFor(u))).json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].courseId).toBe('mathematics-adv-calculus-i');
  });

  it('dedupes to the MOST RECENT generation per (course, assessment date)', async () => {
    const u = await seedUser('u@test.com', 'clerk_u');
    const older = await seedGeneration(u.id, {
      assessmentDate: daysAgo(2), courseId: 'science-adv-biology', createdAt: new Date(Date.now() - 3 * 86400000),
    });
    const newer = await seedGeneration(u.id, {
      assessmentDate: daysAgo(2), courseId: 'science-adv-biology', createdAt: new Date(Date.now() - 2 * 86400000),
    });
    const body = await (await get(appFor(u))).json();
    expect(body.items).toHaveLength(1);
    expect(body.items[0].generationId).toBe(newer);
    expect(body.items[0].generationId).not.toBe(older);
  });

  it('caps the list at 3', async () => {
    const u = await seedUser('u@test.com', 'clerk_u');
    const courses = ['science-adv-biology', 'mathematics-adv-calculus-i', 'wellbeing-adv-psychology', 'arts-acting-and-improv'];
    for (const [i, c] of courses.entries()) {
      await seedGeneration(u.id, { assessmentDate: daysAgo(i + 1), courseId: c });
    }
    const body = await (await get(appFor(u))).json();
    expect(body.items).toHaveLength(3);
  });

  it("never returns another user's generations", async () => {
    const a = await seedUser('a@test.com', 'clerk_a');
    const b = await seedUser('b@test.com', 'clerk_b');
    await seedGeneration(b.id, { assessmentDate: daysAgo(2) });
    const body = await (await get(appFor(a))).json();
    expect(body.items).toHaveLength(0);
  });
});

describe('migration 0010 backfill', () => {
  beforeEach(async () => {
    await resetAllTables();
  });

  it('populates assessment_date from inputs_json for rows that predate the column', async () => {
    const u = await seedUser('u@test.com', 'clerk_u');
    // Simulate a pre-0010 row: inputs_json has the date but the column is NULL.
    const genId = await seedGeneration(u.id, { assessmentDate: null });
    await db
      .update(schema.generations)
      .set({ inputsJson: { assessmentType: 'test', assessmentDate: '2026-06-01' } })
      .where(eq(schema.generations.id, genId));

    // Execute the exact backfill statement from the migration file (idempotent).
    // Match on the SET clause — a bare 'UPDATE' also appears in the FK blocks'
    // 'ON UPDATE no action'.
    const migration = readFileSync(new URL('../../drizzle/0010_yielding_gressill.sql', import.meta.url), 'utf8');
    const backfill = migration.split('--> statement-breakpoint').find((s) => s.includes('SET "assessment_date"'));
    expect(backfill).toBeTruthy();
    await db.execute(sql.raw(backfill!));

    const [row] = await db.select().from(schema.generations).where(eq(schema.generations.id, genId));
    expect(row!.assessmentDate).toBe('2026-06-01');
  });
});
