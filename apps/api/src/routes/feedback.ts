import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { db, schema } from '../lib/db.js';

export const feedback = new Hono();

const FeedbackSchema = z.object({
  generationId: z.string().uuid(),
  promptHash: z.string().length(64),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  text: z.string().max(1000).optional(),
});

feedback.post('/api/feedback', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON' }, 400);
  }

  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid input', issues: parsed.error.issues.map((i) => ({ path: i.path.map(String), message: i.message })) }, 400);
  }

  // Verify generation exists
  const [gen] = await db.select().from(schema.generations).where(eq(schema.generations.id, parsed.data.generationId));
  if (!gen) {
    return c.json({ error: 'generation not found' }, 404);
  }

  // Insert feedback (unique constraint on generation_id prevents duplicates)
  try {
    await db.insert(schema.feedback).values({
      generationId: parsed.data.generationId,
      rating: parsed.data.rating,
      text: parsed.data.text ?? null,
    });
    return c.json({ ok: true }, 200);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('unique') || message.includes('duplicate')) {
      return c.json({ error: 'feedback already submitted for this generation' }, 409);
    }
    console.error('feedback insert failed', { message });
    return c.json({ error: 'internal error' }, 500);
  }
});
