import { describe, it, expect } from 'vitest';
import 'dotenv/config';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

describe('db connection', () => {
  it('connects to Postgres and returns version', async () => {
    const result = await db.execute(sql`SELECT version()`);
    expect(result.length).toBeGreaterThan(0);
    const versionStr = JSON.stringify(result[0]);
    expect(versionStr.toLowerCase()).toContain('postgres');
  });
});
