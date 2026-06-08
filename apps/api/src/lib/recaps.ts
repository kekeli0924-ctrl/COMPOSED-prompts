import { lt } from 'drizzle-orm';
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
