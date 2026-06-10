import 'dotenv/config';
import { db, schema } from '@/lib/db';

export async function resetRateLimitLog(): Promise<void> {
  await db.delete(schema.rateLimitLog);
}

export async function resetAllTables(): Promise<void> {
  // Order matters for FK cascades. Delete recaps explicitly (child of both generations
  // and users) so test isolation is self-evident rather than resting on cascade config;
  // deleting recaps first also clears generations.used_recap_id via ON DELETE SET NULL.
  await db.delete(schema.feedback);
  await db.delete(schema.recaps);
  await db.delete(schema.generations);
  await db.delete(schema.userProfiles);
  await db.delete(schema.users);
  await db.delete(schema.rateLimitLog);
}
