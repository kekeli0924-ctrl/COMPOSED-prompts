import 'dotenv/config';
import { db, schema } from '@/lib/db';

export async function resetRateLimitLog(): Promise<void> {
  await db.delete(schema.rateLimitLog);
}

export async function resetAllTables(): Promise<void> {
  // Order matters for FK cascades
  await db.delete(schema.feedback);
  await db.delete(schema.generations);
  await db.delete(schema.userProfiles);
  await db.delete(schema.users);
  await db.delete(schema.rateLimitLog);
}
