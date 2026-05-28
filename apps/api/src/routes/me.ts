import { Hono } from 'hono';
import { desc, eq, sql } from 'drizzle-orm';
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

me.get('/api/me/history', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  const rows = await db
    .select({
      id: schema.generations.id,
      createdAt: schema.generations.createdAt,
      promptText: schema.generations.promptText,
      llm: schema.generations.provider,
      model: schema.generations.model,
      mode: schema.generations.mode,
      courseId: schema.generations.courseId,
      rating: schema.feedback.rating,
      ratingText: schema.feedback.text,
    })
    .from(schema.generations)
    .leftJoin(schema.feedback, eq(schema.feedback.generationId, schema.generations.id))
    .where(eq(schema.generations.userId, user.id))
    .orderBy(desc(schema.generations.createdAt))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(schema.generations)
    .where(eq(schema.generations.userId, user.id));
  const total = countRow?.c ?? 0;

  return c.json(
    {
      entries: rows.map((r) => ({
        id: r.id,
        createdAt: r.createdAt.toISOString(),
        promptText: r.promptText,
        llm: r.llm,
        model: r.model,
        mode: r.mode,
        courseId: r.courseId,
        rating: r.rating,
        ratingText: r.ratingText,
      })),
      total,
      hasMore: offset + rows.length < total,
    },
    200,
  );
});

me.get('/api/me/history/:id', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const [row] = await db
    .select()
    .from(schema.generations)
    .where(eq(schema.generations.id, id));
  if (!row || row.userId !== user.id) {
    return c.json({ error: 'not found' }, 404);
  }
  return c.json(
    {
      id: row.id,
      createdAt: row.createdAt.toISOString(),
      promptText: row.promptText,
      llm: row.provider,
      model: row.model,
      mode: row.mode,
      courseId: row.courseId,
    },
    200,
  );
});
