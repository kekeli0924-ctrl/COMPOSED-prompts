import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import type { CanvasStatus, CanvasConnectResponse, CanvasUpcomingResponse } from '@composed-prompts/shared';
import { db, schema } from '../lib/db.js';
import { encryptToken, decryptToken } from '../lib/crypto.js';
import { validateToken, fetchUpcoming, CanvasAuthError } from '../lib/canvas.js';

export const canvas = new Hono();

canvas.get('/api/me/canvas/status', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  const [row] = await db.select({ enc: schema.users.canvasTokenEnc }).from(schema.users).where(eq(schema.users.id, user.id));
  return c.json({ connected: Boolean(row?.enc) } satisfies CanvasStatus, 200);
});

canvas.post('/api/me/canvas/connect', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const token = typeof (body as { token?: unknown }).token === 'string' ? (body as { token: string }).token.trim() : '';
  if (!token) return c.json({ connected: false, reason: 'invalid-token' } satisfies CanvasConnectResponse, 200);
  const v = await validateToken(token);
  if (!v.ok) return c.json({ connected: false, reason: 'invalid-token' } satisfies CanvasConnectResponse, 200);
  await db.update(schema.users).set({ canvasTokenEnc: encryptToken(token) }).where(eq(schema.users.id, user.id));
  return c.json({ connected: true } satisfies CanvasConnectResponse, 200);
});

canvas.get('/api/me/canvas/upcoming', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  const [row] = await db.select({ enc: schema.users.canvasTokenEnc }).from(schema.users).where(eq(schema.users.id, user.id));
  if (!row?.enc) return c.json({ connected: false, items: [] } satisfies CanvasUpcomingResponse, 200);
  try {
    const items = await fetchUpcoming(decryptToken(row.enc));
    return c.json({ connected: true, items } satisfies CanvasUpcomingResponse, 200);
  } catch (err) {
    if (err instanceof CanvasAuthError) {
      await db.update(schema.users).set({ canvasTokenEnc: null }).where(eq(schema.users.id, user.id));
      return c.json({ connected: false, reason: 'reconnect', items: [] } satisfies CanvasUpcomingResponse, 200);
    }
    return c.json({ connected: true, items: [], reason: 'canvas-unavailable' } satisfies CanvasUpcomingResponse, 200);
  }
});

canvas.post('/api/me/canvas/disconnect', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);
  await db.update(schema.users).set({ canvasTokenEnc: null }).where(eq(schema.users.id, user.id));
  return c.json({ connected: false } satisfies CanvasStatus, 200);
});
