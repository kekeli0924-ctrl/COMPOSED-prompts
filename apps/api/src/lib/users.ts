import { eq } from 'drizzle-orm';
import { db, schema } from './db.js';

export type LocalUser = {
  id: string;
  email: string;
  displayName: string | null;
  clerkUserId: string;
};

const cols = {
  id: schema.users.id,
  email: schema.users.email,
  displayName: schema.users.displayName,
  clerkUserId: schema.users.clerkUserId,
};

export async function getOrCreateUser(
  clerkUserId: string,
  fetchProfile: () => Promise<{ email: string; displayName: string | null }>,
): Promise<LocalUser> {
  const [existing] = await db.select(cols).from(schema.users).where(eq(schema.users.clerkUserId, clerkUserId));
  if (existing) return existing;

  const profile = await fetchProfile();
  const [created] = await db
    .insert(schema.users)
    .values({ clerkUserId, email: profile.email, displayName: profile.displayName })
    .onConflictDoNothing({ target: schema.users.clerkUserId })
    .returning(cols);
  if (created) return created;

  // Race: another concurrent request inserted between our select and insert.
  const [raced] = await db.select(cols).from(schema.users).where(eq(schema.users.clerkUserId, clerkUserId));
  return raced!;
}
