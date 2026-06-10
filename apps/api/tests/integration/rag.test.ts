import { describe, it, expect, beforeEach } from 'vitest';
import { allCourses, findCourse } from '@composed-prompts/shared';
import { queryCollectiveExamples, queryPersonalExamples, queryPersonalProfile, buildRagContext, fetchRagContext } from '@/lib/rag';
import { db, schema } from '@/lib/db';
import { resetAllTables } from '../setup';

const seedGen = async (opts: { userId?: string; courseId: string; mode: string; rating?: number; createdAt?: Date }): Promise<string> => {
  const [g] = await db.insert(schema.generations).values({
    userId: opts.userId,
    inputsJson: {},
    promptText: `<interaction_style>style for ${opts.courseId}/${opts.mode}</interaction_style>\n<output_spec>output for ${opts.courseId}</output_spec>`,
    promptHash: 'a'.repeat(64),
    generator: 'opus',
    courseId: opts.courseId,
    mode: opts.mode,
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
  }).returning({ id: schema.generations.id });
  if (opts.rating) {
    await db.insert(schema.feedback).values({
      generationId: g!.id,
      rating: opts.rating,
    });
  }
  return g!.id;
};

const seedUser = async (email: string): Promise<string> => {
  const [u] = await db.insert(schema.users).values({ email, clerkUserId: `clerk_${email}` }).returning({ id: schema.users.id });
  return u!.id;
};

describe('RAG queries', () => {
  beforeEach(async () => {
    await resetAllTables();
  });

  describe('queryCollectiveExamples', () => {
    it('returns top examples for course+mode with rating >= 4', async () => {
      await seedGen({ courseId: 'science-astronomy-ii', mode: 'cram-review', rating: 5 });
      await seedGen({ courseId: 'science-astronomy-ii', mode: 'cram-review', rating: 4 });
      await seedGen({ courseId: 'science-astronomy-ii', mode: 'cram-review', rating: 2 }); // excluded (low rating)
      await seedGen({ courseId: 'science-astronomy-ii', mode: 'practice-questions', rating: 5 }); // excluded (different mode)
      const results = await queryCollectiveExamples({ courseId: 'science-astronomy-ii', mode: 'cram-review', limit: 5 });
      expect(results.length).toBe(2);
      expect(results.every((r) => r.rating >= 4)).toBe(true);
    });

    it('returns empty array when no examples exist (cold start)', async () => {
      const results = await queryCollectiveExamples({ courseId: 'science-astronomy-ii', mode: 'cram-review', limit: 5 });
      expect(results).toEqual([]);
    });

    it('tier 2: falls back to same DEPARTMENT + mode when the course has no examples', async () => {
      const target = findCourse('science-astronomy-ii')!;
      const sibling = allCourses().find((c) => c.department === target.department && c.id !== target.id)!;
      await seedGen({ courseId: sibling.id, mode: 'cram-review', rating: 5 });
      const results = await queryCollectiveExamples({ courseId: 'science-astronomy-ii', mode: 'cram-review', limit: 2 });
      expect(results.length).toBe(1);
      expect(results[0]!.promptText).toContain(sibling.id);
    });

    it('tier 2 scopes strictly to the department: other-department rows are NOT included', async () => {
      const target = findCourse('science-astronomy-ii')!;
      const sibling = allCourses().find((c) => c.department === target.department && c.id !== target.id)!;
      const otherDept = allCourses().find((c) => c.department !== target.department)!;
      await seedGen({ courseId: sibling.id, mode: 'cram-review', rating: 4 });
      await seedGen({ courseId: otherDept.id, mode: 'cram-review', rating: 5 }); // higher-rated but wrong dept
      const results = await queryCollectiveExamples({ courseId: 'science-astronomy-ii', mode: 'cram-review', limit: 2 });
      expect(results.length).toBe(1); // tier 2 won — tier 3 never ran
      expect(results[0]!.promptText).toContain(sibling.id);
      expect(results[0]!.promptText).not.toContain(otherDept.id);
    });

    it('tier 1 wins over tier 2 when the exact course has examples', async () => {
      const target = findCourse('science-astronomy-ii')!;
      const sibling = allCourses().find((c) => c.department === target.department && c.id !== target.id)!;
      await seedGen({ courseId: sibling.id, mode: 'cram-review', rating: 5 });
      await seedGen({ courseId: 'science-astronomy-ii', mode: 'cram-review', rating: 4 });
      const results = await queryCollectiveExamples({ courseId: 'science-astronomy-ii', mode: 'cram-review', limit: 2 });
      expect(results.length).toBe(1); // tier 1 stops the cascade
      expect(results[0]!.promptText).toContain('science-astronomy-ii');
    });

    it('tier 3: falls back to same MODE in any course when course + department are empty', async () => {
      const target = findCourse('science-astronomy-ii')!;
      const otherDept = allCourses().find((c) => c.department !== target.department)!;
      await seedGen({ courseId: otherDept.id, mode: 'cram-review', rating: 5 });
      const results = await queryCollectiveExamples({ courseId: 'science-astronomy-ii', mode: 'cram-review', limit: 2 });
      expect(results.length).toBe(1);
      expect(results[0]!.promptText).toContain(otherDept.id);
    });

    it('free-text courses (no catalog id) still get tier-3 mode examples', async () => {
      await seedGen({ courseId: 'science-astronomy-ii', mode: 'cram-review', rating: 5 });
      const results = await queryCollectiveExamples({ courseId: null, mode: 'cram-review', limit: 2 });
      expect(results.length).toBe(1);
    });
  });

  describe('golden exemplar fallback (fetchRagContext)', () => {
    it('fills curated exemplars when every collective tier is empty', async () => {
      const ctx = await fetchRagContext({ userId: null, courseId: 'science-astronomy-ii', mode: 'cram-review' });
      expect(ctx.collective).toEqual([]);
      expect(ctx.curated.length).toBeGreaterThan(0);
      expect(ctx.curated.length).toBeLessThanOrEqual(2);
      const rendered = buildRagContext(ctx);
      expect(rendered).toContain('Curated examples');
      expect(rendered).toContain('not from students');
    });

    it('leaves curated empty when a collective tier produced results', async () => {
      await seedGen({ courseId: 'science-astronomy-ii', mode: 'cram-review', rating: 5 });
      const ctx = await fetchRagContext({ userId: null, courseId: 'science-astronomy-ii', mode: 'cram-review' });
      expect(ctx.collective.length).toBe(1);
      expect(ctx.curated).toEqual([]);
    });
  });

  describe('queryPersonalExamples', () => {
    it('only returns this users high-rated examples', async () => {
      const userA = await seedUser('a@test.com');
      const userB = await seedUser('b@test.com');
      await seedGen({ userId: userA, courseId: 'science-astronomy-ii', mode: 'cram-review', rating: 5 });
      await seedGen({ userId: userB, courseId: 'science-astronomy-ii', mode: 'cram-review', rating: 5 });
      const results = await queryPersonalExamples({ userId: userA, courseId: 'science-astronomy-ii', mode: 'cram-review', limit: 3 });
      expect(results.length).toBe(1);
    });

    it('falls back to same user + same mode when the course has no personal examples', async () => {
      const userA = await seedUser('a@test.com');
      await seedGen({ userId: userA, courseId: 'history-us-history', mode: 'cram-review', rating: 5 });
      const results = await queryPersonalExamples({ userId: userA, courseId: 'science-astronomy-ii', mode: 'cram-review', limit: 3 });
      expect(results.length).toBe(1); // tier 2: user + mode, different course
    });

    it("the personal fallback still never returns another user's examples", async () => {
      const userA = await seedUser('a@test.com');
      const userB = await seedUser('b@test.com');
      await seedGen({ userId: userB, courseId: 'history-us-history', mode: 'cram-review', rating: 5 });
      const results = await queryPersonalExamples({ userId: userA, courseId: 'science-astronomy-ii', mode: 'cram-review', limit: 3 });
      expect(results).toEqual([]);
    });
  });

  describe('queryPersonalProfile', () => {
    it('returns summary when present', async () => {
      const user = await seedUser('u@test.com');
      await db.insert(schema.userProfiles).values({ userId: user, summary: 'Likes rapid quizzes.' });
      const profile = await queryPersonalProfile(user);
      expect(profile).toBe('Likes rapid quizzes.');
    });

    it('returns null when no profile', async () => {
      const user = await seedUser('u@test.com');
      const profile = await queryPersonalProfile(user);
      expect(profile).toBeNull();
    });
  });

  describe('buildRagContext', () => {
    it('returns empty string when all retrievals are empty', () => {
      const ctx = buildRagContext({ collective: [], personal: [], profile: null, curated: [] });
      expect(ctx).toBe('');
    });

    it('includes profile when present', () => {
      const ctx = buildRagContext({
        collective: [],
        personal: [],
        profile: 'Likes rapid quizzes.',
        curated: [],
      });
      expect(ctx).toContain('Personal style notes');
      expect(ctx).toContain('Likes rapid quizzes.');
    });

    it('includes collective examples', () => {
      const ctx = buildRagContext({
        collective: [{ promptText: '<interaction_style>collab</interaction_style>', rating: 5 }],
        personal: [],
        profile: null,
        curated: [],
      });
      expect(ctx).toContain('What worked for OTHER students');
      expect(ctx).toContain('collab');
    });

    it('includes personal example', () => {
      const ctx = buildRagContext({
        collective: [],
        personal: [{ promptText: '<interaction_style>my style</interaction_style>', rating: 5 }],
        profile: null,
        curated: [],
      });
      expect(ctx).toContain('What worked for THIS student');
      expect(ctx).toContain('my style');
    });
  });
});
