import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db, schema } from '../lib/db.js';

export const me = new Hono();

me.get('/api/me', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ user: null }, 200);
  }
  const [profile] = await db
    .select()
    .from(schema.userProfiles)
    .where(eq(schema.userProfiles.userId, user.id));
  return c.json(
    {
      user: { id: user.id, email: user.email, displayName: user.displayName },
      profileSummary: profile?.summary ?? null,
    },
    200,
  );
});
