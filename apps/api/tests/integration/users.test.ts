import { describe, it, expect, beforeEach, vi } from 'vitest';
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
});
