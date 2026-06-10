import { describe, it, expect, beforeEach } from 'vitest';
import { buildDigest } from '@/lib/ops-digest';
import { db, schema } from '@/lib/db';
import { resetAllTables } from '../setup';

describe('buildDigest — counts only, no recap content', () => {
  beforeEach(async () => {
    await resetAllTables();
  });

  it('reports last-24h counts and never reads recap content', async () => {
    const [u] = await db
      .insert(schema.users)
      .values({ email: 'digest@test.com', clerkUserId: 'clerk_digest', displayName: null })
      .returning({ id: schema.users.id });

    const [g1] = await db
      .insert(schema.generations)
      .values({
        userId: u!.id, inputsJson: {}, promptText: 'p', promptHash: 'a'.repeat(64),
        generator: 'opus', mode: 'cram-review', provider: 'anthropic', model: 'claude-opus-4-8', templateVersion: 'v1',
      })
      .returning({ id: schema.generations.id });
    await db.insert(schema.generations).values({
      userId: u!.id, inputsJson: {}, promptText: 'p', promptHash: 'b'.repeat(64),
      generator: 'deterministic', fallbackReason: 'budget-exhausted', mode: 'cram-review',
      provider: 'anthropic', model: 'claude-opus-4-8', templateVersion: 'v1',
    });

    await db.insert(schema.feedback).values({ generationId: g1!.id, userId: u!.id, rating: 4 });

    const SECRET = 'STUDENT_SECRET_WEAK_SPOT_zzz';
    await db.insert(schema.recaps).values({
      userId: u!.id, generationId: g1!.id, recapText: SECRET,
      expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    });

    await db.insert(schema.assessmentOutcomes).values({ userId: u!.id, generationId: g1!.id, outcome: 4 });

    const d = await buildDigest();

    expect(d.generations.total).toBe(2);
    expect(d.generations.byGenerator.opus).toBe(1);
    expect(d.generations.byGenerator.deterministic).toBe(1);
    expect(d.generations.byFallbackReason['budget-exhausted']).toBe(1);
    expect(d.feedback.count).toBe(1);
    expect(d.feedback.avgRating).toBe(4);
    expect(d.recapsSubmitted).toBe(1);
    expect(d.outcomesSubmitted).toBe(1);
    expect(d.newUsers).toBe(1);

    // Personal-only: the digest must carry NO recap content anywhere in its output.
    expect(JSON.stringify(d)).not.toContain(SECRET);
  });
});
