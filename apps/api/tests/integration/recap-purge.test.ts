import { describe, it, expect, beforeEach } from 'vitest';
import { db, schema } from '@/lib/db';
import { deleteExpiredRecaps } from '@/lib/recaps';
import { resetAllTables } from '../setup';

const seedUser = async (): Promise<string> => {
  const [u] = await db
    .insert(schema.users)
    .values({ email: 'p@test.com', clerkUserId: 'clerk_p', displayName: null })
    .returning({ id: schema.users.id });
  return u!.id;
};

describe('deleteExpiredRecaps', () => {
  beforeEach(async () => {
    await resetAllTables();
  });

  it('removes only recaps past expires_at, keeping unexpired ones', async () => {
    const userId = await seedUser();
    const past = new Date(Date.now() - 60_000);
    const future = new Date(Date.now() + 60_000);
    await db.insert(schema.recaps).values([
      { userId, recapText: 'expired one', expiresAt: past },
      { userId, recapText: 'still fresh', expiresAt: future },
    ]);

    const removed = await deleteExpiredRecaps();
    expect(removed).toBe(1);

    const rows = await db.select().from(schema.recaps);
    expect(rows.length).toBe(1);
    expect(rows[0]!.recapText).toBe('still fresh');
  });
});
