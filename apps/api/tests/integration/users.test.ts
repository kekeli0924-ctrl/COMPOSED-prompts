import { describe, it, expect, beforeEach, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { getOrCreateUser } from '@/lib/users';
import { db, schema } from '@/lib/db';
import { resetAllTables } from '../setup';

describe('getOrCreateUser', () => {
  beforeEach(async () => {
    await resetAllTables();
  });

  it('creates a user once and is idempotent', async () => {
    const fetchProfile = vi.fn().mockResolvedValue({ email: 'u@test.com', displayName: 'U' });
    const a = await getOrCreateUser('clerk_1', fetchProfile);
    const b = await getOrCreateUser('clerk_1', fetchProfile);
    expect(a.id).toBe(b.id);
    expect(a.email).toBe('u@test.com');
    expect(fetchProfile).toHaveBeenCalledTimes(1); // not called on cache hit
    const rows = await db.select().from(schema.users);
    expect(rows.length).toBe(1);
  });

  it('sets gradYear from a Pomfret email on insert', async () => {
    const u = await getOrCreateUser('clerk_grad', async () => ({ email: 'jdoe29@pomfret.org', displayName: null }));
    expect(u.gradYear).toBe(2029);
  });

  it('leaves gradYear null for a non-Pomfret email', async () => {
    const u = await getOrCreateUser('clerk_personal', async () => ({ email: 'jdoe29@gmail.com', displayName: null }));
    expect(u.gradYear).toBeNull();
  });

  it('backfills gradYear for an existing row whose grad_year is null', async () => {
    const [row] = await db
      .insert(schema.users)
      .values({ clerkUserId: 'clerk_back', email: 'bsmith28@pomfret.org', displayName: null })
      .returning({ id: schema.users.id });
    const u = await getOrCreateUser('clerk_back', async () => ({ email: 'unused@x.com', displayName: null }));
    expect(u.gradYear).toBe(2028);
    const [reloaded] = await db.select().from(schema.users).where(eq(schema.users.id, row!.id));
    expect(reloaded!.gradYear).toBe(2028);
  });

  it('never overwrites a non-null gradYear', async () => {
    await db
      .insert(schema.users)
      .values({ clerkUserId: 'clerk_manual', email: 'jdoe29@pomfret.org', displayName: null, gradYear: 2030 });
    const u = await getOrCreateUser('clerk_manual', async () => ({ email: 'jdoe29@pomfret.org', displayName: null }));
    expect(u.gradYear).toBe(2030); // manual value preserved, not re-detected to 2029
  });
});
