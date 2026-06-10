import { and, desc, eq, gt, gte, lt } from 'drizzle-orm';
import { db, schema } from './db.js';

// Retention enforcement for the recap capture loop: hard-delete recaps whose
// `expires_at` has passed. Reusable from a cron job (jobs/purge-recaps.ts). Returns
// the number of rows removed. Never logs recap bodies. `now` is injectable for tests.
export async function deleteExpiredRecaps(now: Date = new Date()): Promise<number> {
  const deleted = await db
    .delete(schema.recaps)
    .where(lt(schema.recaps.expiresAt, now))
    .returning({ id: schema.recaps.id });
  return deleted.length;
}

// Only inject a recap this recent into a new generation — older weak spots are likely
// stale (re-studied, or a different unit by now). Distinct from the ~30d storage
// retention: a recap can still exist but be too old to inject.
const maxAgeDays = (): number => {
  const n = parseInt(process.env.RECAP_MAX_AGE_DAYS ?? '14', 10);
  return Number.isFinite(n) && n > 0 ? n : 14;
};

// Deliberately omits follow_up_prompt: stage 2 never injects it (it's a full prompt
// written by a third-party model). Not selecting it makes that guarantee structural —
// the content never leaves the DB — rather than relying on buildRecapContextBlock.
export type UsableRecap = {
  id: string;
  createdAt: Date;
  weakSpotsJson: unknown;
  recapText: string;
};

// STAGE 2 read path — the student's most recent usable recap for a course.
// PERSONAL-ONLY INVARIANT (non-negotiable): every recap read filters by
// `recaps.user_id = userId`; a recap may only ever influence its own author's
// generations. Course scoping comes from the recap's SOURCE generation (inner join —
// recaps without a generation_id are never injectable), bounded by RECAP_MAX_AGE_DAYS
// and the row's own expiry. Newest wins. `now` is injectable for tests.
export async function findUsableRecap(
  userId: string,
  courseId: string,
  now: Date = new Date(),
): Promise<UsableRecap | null> {
  const freshnessCutoff = new Date(now.getTime() - maxAgeDays() * 24 * 60 * 60 * 1000);
  const [row] = await db
    .select({
      id: schema.recaps.id,
      createdAt: schema.recaps.createdAt,
      weakSpotsJson: schema.recaps.weakSpotsJson,
      recapText: schema.recaps.recapText,
    })
    .from(schema.recaps)
    .innerJoin(schema.generations, eq(schema.recaps.generationId, schema.generations.id))
    .where(
      and(
        eq(schema.recaps.userId, userId), // personal-only — never relax this
        eq(schema.generations.courseId, courseId),
        gte(schema.recaps.createdAt, freshnessCutoff),
        gt(schema.recaps.expiresAt, now),
      ),
    )
    .orderBy(desc(schema.recaps.createdAt))
    .limit(1);
  return row ?? null;
}
