import { eq } from 'drizzle-orm';
import { detectGradYear } from '@composed-prompts/shared';
import { db, schema } from './db.js';

export type LocalUser = {
  id: string;
  email: string;
  displayName: string | null;
  clerkUserId: string;
  gradYear: number | null;
};

const cols = {
  id: schema.users.id,
  email: schema.users.email,
  displayName: schema.users.displayName,
  clerkUserId: schema.users.clerkUserId,
  gradYear: schema.users.gradYear,
};

export async function getOrCreateUser(
  clerkUserId: string,
  fetchProfile: () => Promise<{ email: string; displayName: string | null }>,
): Promise<LocalUser> {
  const [existing] = await db.select(cols).from(schema.users).where(eq(schema.users.clerkUserId, clerkUserId));
  if (existing) {
    // Lazy backfill: fill grad_year once for users provisioned before this feature.
    // Never overwrites a non-null value (protects manual overrides + prior detection).
    if (existing.gradYear == null) {
      const detected = detectGradYear(existing.email);
      if (detected != null) {
        await db.update(schema.users).set({ gradYear: detected }).where(eq(schema.users.id, existing.id));
        return { ...existing, gradYear: detected };
      }
    }
    return existing;
  }

  const profile = await fetchProfile();
  const [created] = await db
    .insert(schema.users)
    .values({
      clerkUserId,
      email: profile.email,
      displayName: profile.displayName,
      gradYear: detectGradYear(profile.email),
    })
    .onConflictDoNothing({ target: schema.users.clerkUserId })
    .returning(cols);
  if (created) return created;

  // Race: another concurrent request inserted between our select and insert.
  const [raced] = await db.select(cols).from(schema.users).where(eq(schema.users.clerkUserId, clerkUserId));
  return raced!;
}
