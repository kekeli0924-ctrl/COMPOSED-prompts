import { describe, it, expect, beforeEach, vi } from 'vitest';
import { updateAllProfiles, MIN_RATED_GENERATIONS } from '@/jobs/update-profiles';
import { db, schema } from '@/lib/db';
import { resetAllTables } from '../setup';

describe('updateAllProfiles', () => {
  beforeEach(async () => {
    await resetAllTables();
  });

  it('skips users with fewer than MIN_RATED_GENERATIONS rated generations', async () => {
    const [user] = await db
      .insert(schema.users)
      .values({ email: 'u@test.com', passwordHash: 'x' })
      .returning({ id: schema.users.id });
    // Seed 2 rated generations (below threshold of 5)
    for (let i = 0; i < 2; i++) {
      const [g] = await db
        .insert(schema.generations)
        .values({
          userId: user!.id,
          inputsJson: {},
          promptText: 'p',
          promptHash: 'a'.repeat(64),
          generator: 'opus',
          mode: 'cram-review',
          provider: 'anthropic',
          model: 'claude-opus-4-7',
        })
        .returning({ id: schema.generations.id });
      await db.insert(schema.feedback).values({ generationId: g!.id, rating: 4 });
    }
    const summarizeFn = vi.fn().mockResolvedValue('summary text');
    await updateAllProfiles({ summarizeFn });
    expect(summarizeFn).not.toHaveBeenCalled();
    const profiles = await db.select().from(schema.userProfiles);
    expect(profiles.length).toBe(0);
  });

  it('creates profile for user with >= MIN_RATED_GENERATIONS', async () => {
    const [user] = await db
      .insert(schema.users)
      .values({ email: 'u@test.com', passwordHash: 'x' })
      .returning({ id: schema.users.id });
    for (let i = 0; i < MIN_RATED_GENERATIONS; i++) {
      const [g] = await db
        .insert(schema.generations)
        .values({
          userId: user!.id,
          inputsJson: {},
          promptText: `p${i}`,
          promptHash: 'a'.repeat(64),
          generator: 'opus',
          mode: 'cram-review',
          provider: 'anthropic',
          model: 'claude-opus-4-7',
        })
        .returning({ id: schema.generations.id });
      await db.insert(schema.feedback).values({ generationId: g!.id, rating: 4, text: `comment ${i}` });
    }
    const summarizeFn = vi.fn().mockResolvedValue('This student prefers brief quizzes.');
    await updateAllProfiles({ summarizeFn });
    expect(summarizeFn).toHaveBeenCalledTimes(1);
    const profiles = await db.select().from(schema.userProfiles);
    expect(profiles.length).toBe(1);
    expect(profiles[0]!.summary).toBe('This student prefers brief quizzes.');
  });
});
