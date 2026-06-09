import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import {
  RECAP_START_MARKER,
  RECAP_WEAK_SPOTS_MARKER,
  RECAP_FOLLOW_UP_MARKER,
  RECAP_END_MARKER,
} from '@composed-prompts/shared';
import { withUser } from '../helpers/with-user';
import { db, schema } from '@/lib/db';
import { resetAllTables } from '../setup';

// Rate limit is mocked so it doesn't touch the DB; default allowed, overridden per-test.
const { mockCheckAndRecord } = vi.hoisted(() => ({ mockCheckAndRecord: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkAndRecord: mockCheckAndRecord }));

import { recap } from '@/routes/recap';

type U = { id: string; email: string; displayName: string | null };

const seedUser = async (email: string, clerkUserId: string): Promise<U> => {
  const [u] = await db
    .insert(schema.users)
    .values({ email, clerkUserId, displayName: null })
    .returning({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName });
  return u!;
};

const seedGeneration = async (userId: string | null): Promise<string> => {
  const [g] = await db
    .insert(schema.generations)
    .values({
      userId,
      inputsJson: {},
      promptText: 'p',
      promptHash: 'a'.repeat(64),
      generator: 'opus',
      mode: 'cram-review',
      provider: 'anthropic',
      model: 'claude-opus-4-8',
    })
    .returning({ id: schema.generations.id });
  return g!.id;
};

const appFor = (user: U | null): Hono => {
  const a = new Hono();
  a.use('*', withUser(user));
  a.route('/', recap);
  return a;
};

const post = (app: Hono, body: unknown): Promise<Response> =>
  app.request('/api/recap', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/recap', () => {
  beforeEach(async () => {
    mockCheckAndRecord.mockReset();
    mockCheckAndRecord.mockResolvedValue({ allowed: true, remaining: 29 });
    await resetAllTables();
  });

  it('rejects anonymous callers with 401', async () => {
    const res = await post(appFor(null), {
      generationId: '00000000-0000-0000-0000-000000000000',
      text: 'my recap',
    });
    expect(res.status).toBe(401);
  });

  it('returns 404 for a generation the caller does not own', async () => {
    const a = await seedUser('a@test.com', 'clerk_a');
    const b = await seedUser('b@test.com', 'clerk_b');
    const genId = await seedGeneration(a.id); // belongs to A
    const res = await post(appFor(b), { generationId: genId, text: 'sneaky recap' });
    expect(res.status).toBe(404);
  });

  it('returns 429 when the per-user daily cap is reached', async () => {
    mockCheckAndRecord.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const u = await seedUser('u@test.com', 'clerk_u');
    const genId = await seedGeneration(u.id);
    const res = await post(appFor(u), { generationId: genId, text: 'recap' });
    expect(res.status).toBe(429);
  });

  it('stores the recap with ~30d expiry and never echoes the body', async () => {
    const u = await seedUser('u@test.com', 'clerk_u');
    const genId = await seedGeneration(u.id);
    const SECRET = 'I confused mitosis with meiosis';
    const before = Date.now();
    const res = await post(appFor(u), { generationId: genId, text: SECRET });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, recapId: expect.any(String), parsed: false });
    // The recap body must never be echoed back in the response.
    expect(JSON.stringify(body)).not.toContain('mitosis');

    const rows = await db.select().from(schema.recaps);
    expect(rows.length).toBe(1);
    expect(rows[0]!.userId).toBe(u.id);
    expect(rows[0]!.generationId).toBe(genId);
    expect(rows[0]!.recapText).toBe(SECRET);
    expect(rows[0]!.weakSpotsJson).toBeNull(); // unstructured paste → no parsed fields
    expect(rows[0]!.followUpPrompt).toBeNull();
    const exp = new Date(rows[0]!.expiresAt).getTime();
    const expected = before + 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(exp - expected)).toBeLessThan(60_000); // within a minute of now + 30d
  });

  it('parses a sentinel-format recap into structured fields and keeps raw text byte-identical', async () => {
    const u = await seedUser('u@test.com', 'clerk_u');
    const genId = await seedGeneration(u.id);
    // Deliberately messy: prose around the block, odd casing, trailing whitespace —
    // the raw text must round-trip EXACTLY as pasted, while the parser extracts fields.
    const RAW = [
      'Great session! Here is your recap:  ',
      RECAP_START_MARKER.toLowerCase(),
      RECAP_WEAK_SPOTS_MARKER,
      '- Confused activation energy with enthalpy',
      '* Forgot Le Chatelier shifts for pressure',
      RECAP_FOLLOW_UP_MARKER,
      'Drill me on equilibrium shifts with mixed MC + short answer.',
      RECAP_END_MARKER,
      'See you next time!',
    ].join('\n');

    const res = await post(appFor(u), { generationId: genId, text: RAW });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true, recapId: expect.any(String), parsed: true });
    // Response must never carry recap content (weak spots included).
    expect(JSON.stringify(body)).not.toContain('Chatelier');

    const rows = await db.select().from(schema.recaps);
    expect(rows.length).toBe(1);
    expect(rows[0]!.recapText).toBe(RAW); // round-trip: raw stored byte-identical
    expect(rows[0]!.weakSpotsJson).toEqual([
      'Confused activation energy with enthalpy',
      'Forgot Le Chatelier shifts for pressure',
    ]);
    expect(rows[0]!.followUpPrompt).toBe('Drill me on equilibrium shifts with mixed MC + short answer.');
  });
});
