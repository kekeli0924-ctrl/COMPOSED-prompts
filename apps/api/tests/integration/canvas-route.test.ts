import { describe, it, expect, beforeEach, vi } from 'vitest';
import { randomBytes } from 'node:crypto';
import { Hono } from 'hono';
import { withUser, type TestUser } from '../helpers/with-user';
import { resetAllTables } from '../setup';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

const { mockValidate, mockUpcoming } = vi.hoisted(() => ({ mockValidate: vi.fn(), mockUpcoming: vi.fn() }));
vi.mock('@/lib/canvas', () => ({ validateToken: mockValidate, fetchUpcoming: mockUpcoming, CanvasAuthError: class extends Error {} }));

import { canvas } from '@/routes/canvas';
import { CanvasAuthError } from '@/lib/canvas';

let USER: TestUser;
const appFor = (u: TestUser) => { const a = new Hono(); a.use('*', withUser(u)); a.route('/', canvas); return a; };
const connect = (u: TestUser, token: string) => appFor(u).request('/api/me/canvas/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token }) });

describe('canvas routes', () => {
  beforeEach(async () => {
    process.env.CANVAS_TOKEN_KEY = randomBytes(32).toString('base64');
    mockValidate.mockReset(); mockUpcoming.mockReset();
    await resetAllTables();
    const [u] = await db.insert(schema.users).values({ email: 'c@test.com', clerkUserId: 'cc1', displayName: null }).returning({ id: schema.users.id });
    USER = { id: u!.id, email: 'c@test.com', displayName: null, clerkUserId: 'cc1' };
  });

  it('401 when anonymous', async () => {
    expect((await appFor(null).request('/api/me/canvas/status')).status).toBe(401);
  });
  it('connect with an invalid token does not store it', async () => {
    mockValidate.mockResolvedValue({ ok: false });
    expect(await (await connect(USER, 'bad')).json()).toEqual({ connected: false, reason: 'invalid-token' });
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, USER.id));
    expect(row!.canvasTokenEnc).toBeNull();
  });
  it('connect with a valid token stores it encrypted; status connected', async () => {
    mockValidate.mockResolvedValue({ ok: true, name: 'K' });
    expect(await (await connect(USER, 'real-token')).json()).toEqual({ connected: true });
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, USER.id));
    expect(row!.canvasTokenEnc).toBeTruthy();
    expect(row!.canvasTokenEnc).not.toContain('real-token');
    expect(await (await appFor(USER).request('/api/me/canvas/status')).json()).toEqual({ connected: true });
  });
  it('upcoming returns items when connected', async () => {
    mockValidate.mockResolvedValue({ ok: true });
    await connect(USER, 't');
    mockUpcoming.mockResolvedValue([{ id: '1', title: 'Test', course: 'Bio', dueDate: '2026-06-10T00:00:00Z', type: 'assignment', url: null }]);
    const body = await (await appFor(USER).request('/api/me/canvas/upcoming')).json();
    expect(body.connected).toBe(true);
    expect(body.items).toHaveLength(1);
  });
  it('upcoming on Canvas 401 clears the token + reconnect', async () => {
    mockValidate.mockResolvedValue({ ok: true });
    await connect(USER, 't');
    mockUpcoming.mockRejectedValue(new CanvasAuthError('x'));
    expect(await (await appFor(USER).request('/api/me/canvas/upcoming')).json()).toEqual({ connected: false, reason: 'reconnect', items: [] });
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, USER.id));
    expect(row!.canvasTokenEnc).toBeNull();
  });
  it('disconnect nulls the column', async () => {
    mockValidate.mockResolvedValue({ ok: true });
    await connect(USER, 't');
    expect(await (await appFor(USER).request('/api/me/canvas/disconnect', { method: 'POST' })).json()).toEqual({ connected: false });
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, USER.id));
    expect(row!.canvasTokenEnc).toBeNull();
  });
});
