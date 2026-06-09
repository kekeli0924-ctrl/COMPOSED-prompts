import { Hono } from 'hono';
import { z } from 'zod';
import { eq } from 'drizzle-orm';
import { parseRecapText, type RecapResponse } from '@composed-prompts/shared';
import { checkAndRecord } from '../lib/rate-limit.js';
import { db, schema } from '../lib/db.js';

export const recap = new Hono();

const PER_USER = parseInt(process.env.RECAP_PER_USER_PER_DAY ?? '30', 10);
const RETENTION_DAYS = parseInt(process.env.RECAP_RETENTION_DAYS ?? '30', 10);
const MAX_TEXT = 20000; // same ceiling as the wizard `material` field

const RecapSchema = z.object({
  generationId: z.string().uuid(),
  text: z.string().min(1).max(MAX_TEXT),
});

recap.post('/api/recap', async (c) => {
  // SIGNED-IN ONLY — no anonymous recap capture (unlike generation).
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON' }, 400);
  }
  const parsed = RecapSchema.safeParse(body);
  if (!parsed.success) {
    return c.json(
      { error: 'invalid input', issues: parsed.error.issues.map((i) => ({ path: i.path.map(String), message: i.message })) },
      400,
    );
  }

  // Per-user daily cap. Default fail-open — recaps don't spend money, so a DB blip
  // shouldn't reject a legitimate save.
  const rl = await checkAndRecord(`recap:user:${user.id}`, { limit: PER_USER, windowSeconds: 86400 });
  if (!rl.allowed) {
    console.log('[recap] blocked: per-user daily cap reached', { userId: user.id, limit: PER_USER });
    return c.json({ error: 'daily recap limit reached' }, 429);
  }

  // Ownership-scoped: a recap may attach only to the caller's OWN generation
  // (mirrors /api/me/history/:id). 404 (not 403) so we don't confirm the existence
  // of another user's generation id.
  const [gen] = await db
    .select({ userId: schema.generations.userId })
    .from(schema.generations)
    .where(eq(schema.generations.id, parsed.data.generationId));
  if (!gen || gen.userId !== user.id) {
    return c.json({ error: 'not found' }, 404);
  }

  const expiresAt = new Date(Date.now() + RETENTION_DAYS * 24 * 60 * 60 * 1000);

  // Structured extraction (v2 prompts emit the sentinel wire format). Raw text is
  // stored unchanged either way — the stage-2 fallback needs it byte-identical.
  const structured = parseRecapText(parsed.data.text);

  // PERSONAL-ONLY INVARIANT: this row is visible to and usable by ONLY this student.
  // It must NEVER be added to any collective/cross-student pool or shared RAG query.
  // `recap_text` (and the parsed fields) are stored raw because stage 2 feeds them back
  // into the student's OWN next generation — the body is never logged and never
  // returned to anyone but its author.
  const [row] = await db
    .insert(schema.recaps)
    .values({
      userId: user.id,
      generationId: parsed.data.generationId,
      recapText: parsed.data.text,
      weakSpotsJson: structured?.weakSpots ?? null,
      followUpPrompt: structured?.followUpPrompt ?? null,
      expiresAt,
    })
    .returning({ id: schema.recaps.id });

  // Counts/lengths only — never the recap body (mirrors canvas.ts's count-only logging).
  console.log('[recap] stored', {
    userId: user.id,
    parsed: structured !== null,
    weakSpotCount: structured?.weakSpots.length ?? 0,
    textLength: parsed.data.text.length,
  });
  return c.json({ ok: true, recapId: row!.id, parsed: structured !== null } satisfies RecapResponse, 200);
});
