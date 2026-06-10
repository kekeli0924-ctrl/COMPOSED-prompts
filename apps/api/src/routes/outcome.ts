import { Hono } from 'hono';
import { z } from 'zod';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import type { OutcomeResponse, PendingOutcomesResponse } from '@composed-prompts/shared';
import { checkAndRecord } from '../lib/rate-limit.js';
import { db, schema } from '../lib/db.js';

export const outcome = new Hono();

const PER_USER = parseInt(process.env.OUTCOME_PER_USER_PER_DAY ?? '30', 10);

const OutcomeSchema = z.object({
  generationId: z.string().uuid(),
  outcome: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
});

// One-tap post-assessment check-in. SIGNED-IN ONLY. Upserts so a student can revise.
outcome.post('/api/outcome', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON' }, 400);
  }
  const parsed = OutcomeSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: 'invalid input', issues: parsed.error.issues.map((i) => ({ path: i.path.map(String), message: i.message })) },
      400,
    );
  }

  // Modest per-user cap. Fail-open like recaps — outcomes don't spend money.
  const rl = await checkAndRecord(`outcome:user:${user.id}`, { limit: PER_USER, windowSeconds: 86400 });
  if (!rl.allowed) {
    return c.json({ error: 'daily outcome limit reached' }, 429);
  }

  // Ownership-scoped: 404 (not 403) so another user's generation id isn't confirmed
  // to exist (mirrors /api/me/history/:id and /api/recap).
  const [gen] = await db
    .select({ userId: schema.generations.userId })
    .from(schema.generations)
    .where(eq(schema.generations.id, parsed.data.generationId));
  if (!gen || gen.userId !== user.id) {
    return c.json({ error: 'not found' }, 404);
  }

  await db
    .insert(schema.assessmentOutcomes)
    .values({
      userId: user.id,
      generationId: parsed.data.generationId,
      outcome: parsed.data.outcome,
    })
    .onConflictDoUpdate({
      target: schema.assessmentOutcomes.generationId,
      set: { outcome: parsed.data.outcome, createdAt: sql`now()` },
    });

  // A 1-5 number is not user content; ids + number only.
  console.log('[outcome] stored', { userId: user.id, outcome: parsed.data.outcome });
  return c.json({ ok: true } satisfies OutcomeResponse, 200);
});

// The caller's generations whose assessment date has PASSED recently (yesterday back
// to 14 days ago, computed DB-side so client clocks don't matter) and that have no
// outcome row yet — deduped to the most recent generation per (course, date), max 3.
outcome.get('/api/me/pending-outcomes', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  const rows = await db
    .select({
      generationId: schema.generations.id,
      courseId: schema.generations.courseId,
      // assessmentType has no dedicated column — read it from inputs_json like
      // /api/me/history does (it is not in the redacted set).
      inputsJson: schema.generations.inputsJson,
      assessmentDate: schema.generations.assessmentDate,
    })
    .from(schema.generations)
    .leftJoin(schema.assessmentOutcomes, eq(schema.assessmentOutcomes.generationId, schema.generations.id))
    .where(
      and(
        eq(schema.generations.userId, user.id),
        isNull(schema.assessmentOutcomes.id), // no outcome submitted yet
        sql`${schema.generations.assessmentDate} BETWEEN current_date - 14 AND current_date - 1`,
      ),
    )
    .orderBy(desc(schema.generations.createdAt));

  // Most recent generation per (course, assessment date); a student often generates
  // several prompts for the same test — ask about it once.
  const seen = new Set<string>();
  const items: PendingOutcomesResponse['items'] = [];
  for (const r of rows) {
    if (r.assessmentDate === null) continue;
    const key = `${r.courseId ?? 'free-text'}|${r.assessmentDate}`;
    if (seen.has(key)) continue;
    seen.add(key);
    items.push({
      generationId: r.generationId,
      courseId: r.courseId,
      assessmentType: (r.inputsJson as { assessmentType?: string } | null)?.assessmentType ?? null,
      assessmentDate: r.assessmentDate,
    });
    if (items.length >= 3) break;
  }

  return c.json({ items } satisfies PendingOutcomesResponse, 200);
});
