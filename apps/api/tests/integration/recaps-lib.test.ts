import { describe, it, expect, beforeEach } from 'vitest';
import { eq } from 'drizzle-orm';
import { findUsableRecap } from '@/lib/recaps';
import { db, schema } from '@/lib/db';
import { resetAllTables } from '../setup';

const COURSE = 'science-astronomy-ii';
const OTHER_COURSE = 'science-biology';

const seedUser = async (email: string, clerkUserId: string): Promise<string> => {
  const [u] = await db
    .insert(schema.users)
    .values({ email, clerkUserId, displayName: null })
    .returning({ id: schema.users.id });
  return u!.id;
};

const seedGeneration = async (userId: string, courseId: string | null): Promise<string> => {
  const [g] = await db
    .insert(schema.generations)
    .values({
      userId, courseId, inputsJson: {}, promptText: 'p', promptHash: 'a'.repeat(64),
      generator: 'opus', mode: 'cram-review', provider: 'anthropic', model: 'claude-opus-4-8', templateVersion: 'v2',
    })
    .returning({ id: schema.generations.id });
  return g!.id;
};

const seedRecap = async (
  userId: string,
  generationId: string | null,
  text: string,
  opts: { createdAt?: Date; expiresAt?: Date } = {},
): Promise<string> => {
  const [r] = await db
    .insert(schema.recaps)
    .values({
      userId, generationId, recapText: text,
      weakSpotsJson: [`spot from: ${text}`],
      createdAt: opts.createdAt ?? new Date(),
      expiresAt: opts.expiresAt ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    })
    .returning({ id: schema.recaps.id });
  return r!.id;
};

describe('findUsableRecap — personal-only, course-scoped, fresh', () => {
  beforeEach(async () => {
    await resetAllTables();
  });

  it("NEVER returns another user's recap, even on the same course", async () => {
    const a = await seedUser('a@test.com', 'clerk_a');
    const b = await seedUser('b@test.com', 'clerk_b');
    const aGen = await seedGeneration(a, COURSE);
    const bGen = await seedGeneration(b, COURSE);
    const aRecapId = await seedRecap(a, aGen, 'A recap');
    const bRecapId = await seedRecap(b, bGen, 'B recap');

    const forA = await findUsableRecap(a, COURSE);
    const forB = await findUsableRecap(b, COURSE);
    expect(forA!.id).toBe(aRecapId);
    expect(forA!.recapText).toBe('A recap');
    expect(forB!.id).toBe(bRecapId);

    // The sharper isolation claim: when A has NO recap, the answer is null —
    // never user B's recap on the very same course.
    await db.delete(schema.recaps).where(eq(schema.recaps.id, aRecapId));
    expect(await findUsableRecap(a, COURSE)).toBeNull();
  });

  it('returns null for a stale recap (older than RECAP_MAX_AGE_DAYS, default 14)', async () => {
    const u = await seedUser('u@test.com', 'clerk_u');
    const gen = await seedGeneration(u, COURSE);
    await seedRecap(u, gen, 'old recap', { createdAt: new Date(Date.now() - 20 * 24 * 60 * 60 * 1000) });
    expect(await findUsableRecap(u, COURSE)).toBeNull();
  });

  it('returns null for an expired recap even if recently created', async () => {
    const u = await seedUser('u@test.com', 'clerk_u');
    const gen = await seedGeneration(u, COURSE);
    await seedRecap(u, gen, 'expired recap', { expiresAt: new Date(Date.now() - 60_000) });
    expect(await findUsableRecap(u, COURSE)).toBeNull();
  });

  it('scopes by course: a recap from another course never matches', async () => {
    const u = await seedUser('u@test.com', 'clerk_u');
    const gen = await seedGeneration(u, OTHER_COURSE);
    await seedRecap(u, gen, 'biology recap');
    expect(await findUsableRecap(u, COURSE)).toBeNull();
  });

  it('excludes recaps whose source generation is gone (generation_id null)', async () => {
    const u = await seedUser('u@test.com', 'clerk_u');
    await seedRecap(u, null, 'orphaned recap');
    expect(await findUsableRecap(u, COURSE)).toBeNull();
  });

  it('returns the NEWEST usable recap when several exist', async () => {
    const u = await seedUser('u@test.com', 'clerk_u');
    const gen = await seedGeneration(u, COURSE);
    await seedRecap(u, gen, 'older', { createdAt: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000) });
    const newest = await seedRecap(u, gen, 'newest', { createdAt: new Date(Date.now() - 60_000) });
    const r = await findUsableRecap(u, COURSE);
    expect(r!.id).toBe(newest);
    expect(Array.isArray(r!.weakSpotsJson)).toBe(true);
    // follow_up_prompt is deliberately not selected (never injected) — assert that
    // the shape callers receive does not carry it.
    expect('followUpPrompt' in (r as object)).toBe(false);
  });
});
