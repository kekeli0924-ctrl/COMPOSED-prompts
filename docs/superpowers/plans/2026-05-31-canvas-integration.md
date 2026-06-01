# Canvas Integration (v1) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in student connect Pomfret Canvas with a personal access token (stored encrypted) so the system shows their real upcoming assessments on the dashboard, with an in-app token guide.

**Architecture:** API holds the token (AES-256-GCM at rest, `CANVAS_TOKEN_KEY` Fly secret), calls `pomfret.instructure.com` server-side, and exposes `/api/me/canvas/*`. The web Account page has a `CanvasConnect` card (connect form + guide + disconnect + list); the dashboard sources "Next assessment" from Canvas when connected. Token never reaches the browser or logs; disconnect deletes it.

**Tech Stack:** Hono + Drizzle + Postgres (Neon), `node:crypto`, Next.js 14 + Tailwind/shadcn (Editorial Calm), Clerk, Vitest. No new npm deps.

---

## Security non-negotiables (apply to every task)
Encrypted at rest · token NEVER returned to the client or put in any log/error/response · all Canvas calls server-side · disconnect deletes · validate on connect. If a step would leak the token, stop and flag it.

## Conventions
- `apps/api` test imports use the `@/` alias (→ `apps/api/src`). Work on `main`. After file moves, watch for + `rm -rf` reappearing zombie files (`apps/web/app/about/`, `apps/web/components/RagPanel.tsx`).

---

### Task 1: Token encryption util (`crypto.ts`) — TDD

**Files:** Create `apps/api/src/lib/crypto.ts`, `apps/api/tests/unit/crypto.test.ts`

- [ ] **Step 1: Failing test.** `apps/api/tests/unit/crypto.test.ts`:
```ts
import { describe, it, expect, beforeEach } from 'vitest';
import { randomBytes } from 'node:crypto';
import { encryptToken, decryptToken } from '@/lib/crypto';

describe('crypto', () => {
  beforeEach(() => { process.env.CANVAS_TOKEN_KEY = randomBytes(32).toString('base64'); });

  it('round-trips and does not leak plaintext', () => {
    const blob = encryptToken('secret~token~123');
    expect(blob).not.toContain('secret~token~123');
    expect(decryptToken(blob)).toBe('secret~token~123');
  });
  it('uses distinct IVs per call', () => {
    expect(encryptToken('x')).not.toBe(encryptToken('x'));
  });
  it('throws on a tampered blob', () => {
    const [iv, tag] = encryptToken('y').split(':');
    const tampered = [iv, tag, Buffer.from('garbage').toString('base64')].join(':');
    expect(() => decryptToken(tampered)).toThrow();
  });
  it('throws when the key is missing', () => {
    delete process.env.CANVAS_TOKEN_KEY;
    expect(() => encryptToken('z')).toThrow();
  });
  it('throws when the key is not 32 bytes', () => {
    process.env.CANVAS_TOKEN_KEY = Buffer.from('short').toString('base64');
    expect(() => encryptToken('z')).toThrow();
  });
});
```

- [ ] **Step 2: Run — FAIL.** `cd apps/api && npx vitest run tests/unit/crypto.test.ts` → module not found.

- [ ] **Step 3: Implement.** `apps/api/src/lib/crypto.ts`:
```ts
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

// AES-256-GCM. Key is a 32-byte value provided base64 in CANVAS_TOKEN_KEY.
// Blob format: base64(iv) ':' base64(authTag) ':' base64(ciphertext).
function getKey(): Buffer {
  const b64 = process.env.CANVAS_TOKEN_KEY;
  if (!b64) throw new Error('CANVAS_TOKEN_KEY not configured');
  const key = Buffer.from(b64, 'base64');
  if (key.length !== 32) throw new Error('CANVAS_TOKEN_KEY must decode to 32 bytes');
  return key;
}

export function encryptToken(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', getKey(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  return [iv.toString('base64'), cipher.getAuthTag().toString('base64'), ct.toString('base64')].join(':');
}

export function decryptToken(blob: string): string {
  const [ivB64, tagB64, ctB64] = blob.split(':');
  if (!ivB64 || !tagB64 || !ctB64) throw new Error('malformed token blob');
  const decipher = createDecipheriv('aes-256-gcm', getKey(), Buffer.from(ivB64, 'base64'));
  decipher.setAuthTag(Buffer.from(tagB64, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, 'base64')), decipher.final()]).toString('utf8');
}
```

- [ ] **Step 4: Run — PASS.** `cd apps/api && npx vitest run tests/unit/crypto.test.ts && npx tsc --noEmit` → 5/5, tsc clean.
- [ ] **Step 5: Commit.** `git add apps/api/src/lib/crypto.ts apps/api/tests/unit/crypto.test.ts && git commit -m "feat(api): AES-256-GCM token encryption util"`

---

### Task 2: Shared contracts

**Files:** Modify `packages/shared/src/api-contracts.ts`

- [ ] **Step 1: Add types** at the end of the file:
```ts
// Canvas integration
export type UpcomingAssessment = {
  id: string;
  title: string;
  course: string | null;
  dueDate: string; // ISO
  type: string;    // 'assignment' | 'quiz' | …
  url: string | null;
};
export type CanvasStatus = { connected: boolean };
export type CanvasConnectResponse = { connected: boolean; reason?: 'invalid-token' };
export type CanvasUpcomingResponse = { connected: boolean; items: UpcomingAssessment[]; reason?: 'reconnect' | 'canvas-unavailable' };
```
- [ ] **Step 2: Verify + commit.** `cd apps/api && npx tsc --noEmit` (validates the shared types compile in a consumer). Then `git add packages/shared/src/api-contracts.ts && git commit -m "feat(shared): Canvas assessment + response contracts"`

---

### Task 3: Canvas API client (`canvas.ts`) — TDD

**Files:** Create `apps/api/src/lib/canvas.ts`, `apps/api/tests/unit/canvas.test.ts`

- [ ] **Step 1: Failing test** (mocks `global.fetch`). `apps/api/tests/unit/canvas.test.ts`:
```ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { validateToken, fetchUpcoming, CanvasAuthError } from '@/lib/canvas';

const mockFetch = (status: number, body: unknown) =>
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );

afterEach(() => vi.restoreAllMocks());

describe('validateToken', () => {
  it('ok on 200', async () => {
    mockFetch(200, { name: 'Kerun Li' });
    expect(await validateToken('t')).toEqual({ ok: true, name: 'Kerun Li' });
  });
  it('not ok on 401', async () => {
    mockFetch(401, { errors: [] });
    expect((await validateToken('bad')).ok).toBe(false);
  });
});

describe('fetchUpcoming', () => {
  it('normalizes future assignments, sorted, and drops past/non-assignments', async () => {
    const future1 = new Date(Date.now() + 2 * 86400000).toISOString();
    const future2 = new Date(Date.now() + 5 * 86400000).toISOString();
    const past = new Date(Date.now() - 86400000).toISOString();
    mockFetch(200, [
      { type: 'assignment', html_url: 'u2', context_name: 'US History', assignment: { id: 2, name: 'DBQ', due_at: future2 } },
      { type: 'assignment', html_url: 'u1', context_name: 'Biology', assignment: { id: 1, name: 'Cell Test', due_at: future1 } },
      { type: 'assignment', context_name: 'Past', assignment: { id: 9, name: 'Old', due_at: past } },
      { type: 'event', context_name: 'Club', title: 'Meeting' }, // no assignment → dropped
    ]);
    const items = await fetchUpcoming('t');
    expect(items.map((i) => i.id)).toEqual(['1', '2']); // sorted by dueDate asc, past + non-assignment dropped
    expect(items[0]).toMatchObject({ title: 'Cell Test', course: 'Biology', dueDate: future1, url: 'u1' });
  });
  it('throws CanvasAuthError on 401', async () => {
    mockFetch(401, {});
    await expect(fetchUpcoming('expired')).rejects.toBeInstanceOf(CanvasAuthError);
  });
});
```

- [ ] **Step 2: Run — FAIL.** `cd apps/api && npx vitest run tests/unit/canvas.test.ts`.

- [ ] **Step 3: Implement.** `apps/api/src/lib/canvas.ts`:
```ts
import type { UpcomingAssessment } from '@composed-prompts/shared';

const CANVAS_BASE = 'https://pomfret.instructure.com';

export class CanvasAuthError extends Error {}
export class CanvasError extends Error {}

type UpcomingEvent = {
  type?: string;
  html_url?: string;
  context_name?: string;
  assignment?: { id: number; name: string; due_at?: string | null };
};

async function canvasGet(token: string, path: string): Promise<unknown> {
  // NOTE: the token only ever goes in the Authorization header — never in a thrown message or log.
  const res = await fetch(`${CANVAS_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15000),
  });
  if (res.status === 401) throw new CanvasAuthError('canvas auth failed');
  if (!res.ok) throw new CanvasError(`canvas ${res.status}`);
  return res.json();
}

export async function validateToken(token: string): Promise<{ ok: boolean; name?: string }> {
  try {
    const me = (await canvasGet(token, '/api/v1/users/self')) as { name?: string };
    return { ok: true, name: me.name };
  } catch {
    return { ok: false };
  }
}

export async function fetchUpcoming(token: string): Promise<UpcomingAssessment[]> {
  const events = (await canvasGet(token, '/api/v1/users/self/upcoming_events')) as UpcomingEvent[];
  const now = Date.now();
  return events
    .filter((e): e is UpcomingEvent & { assignment: { id: number; name: string; due_at: string } } =>
      Boolean(e.assignment?.due_at) && new Date(e.assignment!.due_at as string).getTime() > now)
    .map((e) => ({
      id: String(e.assignment.id),
      title: e.assignment.name,
      course: e.context_name ?? null,
      dueDate: e.assignment.due_at,
      type: e.type ?? 'assignment',
      url: e.html_url ?? null,
    }))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
}
```
(`fetchUpcoming` deliberately lets `CanvasAuthError`/`CanvasError` propagate — the route decides what to do. If, against the live API, `upcoming_events` returns nothing useful, switch to active courses → `/api/v1/courses/:id/assignments?bucket=upcoming` and document it; keep the same `UpcomingAssessment[]` output + tests.)

- [ ] **Step 4: Run — PASS.** `cd apps/api && npx vitest run tests/unit/canvas.test.ts && npx tsc --noEmit`.
- [ ] **Step 5: Commit.** `git add apps/api/src/lib/canvas.ts apps/api/tests/unit/canvas.test.ts && git commit -m "feat(api): Canvas client (validate + fetch upcoming, server-side)"`

---

### Task 4: Schema column + migration

**Files:** Modify `apps/api/src/schema.ts`; Create `apps/api/drizzle/0005_*.sql` (generated)

- [ ] **Step 1: Add the column.** In `apps/api/src/schema.ts`, in the `users` table, add after `gradYear: integer('grad_year'),`:
```ts
  canvasTokenEnc: text('canvas_token_enc'),
```
(`text` is already imported — `email`/`displayName` use it.)

- [ ] **Step 2: Generate the migration.** `cd apps/api && npm run db:generate`. Expect a new `apps/api/drizzle/0005_*.sql` containing `ALTER TABLE "users" ADD COLUMN "canvas_token_enc" text;` (additive, nullable — safe). Confirm it's only that column.

- [ ] **Step 3: Apply to the local/test DB** so the route tests (Task 5) have the column: `cd apps/api && npm run db:migrate` (against your local/test `DATABASE_URL`). Expect it to apply 0005.

- [ ] **Step 4: Verify + commit.** `cd apps/api && npx tsc --noEmit`. `git add apps/api/src/schema.ts apps/api/drizzle && git commit -m "feat(api): add nullable canvas_token_enc column (migration 0005)"`

> **USER ACTION (later, at deploy):** apply this migration to the **prod** Neon DB (`db:migrate` against the prod `DATABASE_URL`). Additive nullable column — safe, no downtime.

---

### Task 5: Canvas routes + mount + integration tests

**Files:** Create `apps/api/src/routes/canvas.ts`, `apps/api/tests/integration/canvas-route.test.ts`; Modify `apps/api/src/index.ts`

- [ ] **Step 1: Failing integration test.** `apps/api/tests/integration/canvas-route.test.ts` — mock the canvas client + set a key; seed a real user (UUID):
```ts
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
    const res = await appFor(USER).request('/api/me/canvas/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'bad' }) });
    expect(await res.json()).toEqual({ connected: false, reason: 'invalid-token' });
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, USER.id));
    expect(row!.canvasTokenEnc).toBeNull();
  });

  it('connect with a valid token stores it (encrypted) and status reflects connected', async () => {
    mockValidate.mockResolvedValue({ ok: true, name: 'K' });
    expect(await (await appFor(USER).request('/api/me/canvas/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'real-token' }) })).json()).toEqual({ connected: true });
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, USER.id));
    expect(row!.canvasTokenEnc).toBeTruthy();
    expect(row!.canvasTokenEnc).not.toContain('real-token'); // stored encrypted
    expect(await (await appFor(USER).request('/api/me/canvas/status')).json()).toEqual({ connected: true });
  });

  it('upcoming returns items when connected', async () => {
    mockValidate.mockResolvedValue({ ok: true });
    await appFor(USER).request('/api/me/canvas/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 't' }) });
    mockUpcoming.mockResolvedValue([{ id: '1', title: 'Test', course: 'Bio', dueDate: '2026-06-10T00:00:00Z', type: 'assignment', url: null }]);
    const body = await (await appFor(USER).request('/api/me/canvas/upcoming')).json();
    expect(body.connected).toBe(true);
    expect(body.items).toHaveLength(1);
  });

  it('upcoming on a Canvas 401 clears the token and asks to reconnect', async () => {
    mockValidate.mockResolvedValue({ ok: true });
    await appFor(USER).request('/api/me/canvas/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 't' }) });
    mockUpcoming.mockRejectedValue(new CanvasAuthError('x'));
    expect(await (await appFor(USER).request('/api/me/canvas/upcoming')).json()).toEqual({ connected: false, reason: 'reconnect', items: [] });
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, USER.id));
    expect(row!.canvasTokenEnc).toBeNull();
  });

  it('disconnect nulls the column', async () => {
    mockValidate.mockResolvedValue({ ok: true });
    await appFor(USER).request('/api/me/canvas/connect', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 't' }) });
    expect(await (await appFor(USER).request('/api/me/canvas/disconnect', { method: 'POST' })).json()).toEqual({ connected: false });
    const [row] = await db.select().from(schema.users).where(eq(schema.users.id, USER.id));
    expect(row!.canvasTokenEnc).toBeNull();
  });
});
```
(Check `apps/api/tests/helpers/with-user` + `../setup` exports match the sharpen-route test's usage; mirror them exactly.)

- [ ] **Step 2: Run — FAIL.** `cd apps/api && npx vitest run tests/integration/canvas-route.test.ts`.

- [ ] **Step 3: Implement the routes.** `apps/api/src/routes/canvas.ts`:
```ts
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
```
(Deviation from spec: disconnect is `POST /api/me/canvas/disconnect` rather than `DELETE` — the web `useApi` hook exposes `apiGet/apiPost/apiPatch` only, no DELETE, so POST avoids adding a client method. Functionally identical: nulls the column.)

- [ ] **Step 4: Mount in `apps/api/src/index.ts`.** Add `import { canvas } from './routes/canvas.js';` with the other route imports, and `app.route('/', canvas);` after `app.route('/', me);`.

- [ ] **Step 5: Run — PASS.** `cd apps/api && npx vitest run tests/integration/canvas-route.test.ts && npx tsc --noEmit` → all pass, tsc clean.
- [ ] **Step 6: Commit.** `git add apps/api/src/routes/canvas.ts apps/api/tests/integration/canvas-route.test.ts apps/api/src/index.ts && git commit -m "feat(api): /api/me/canvas routes (connect/upcoming/disconnect, signed-in)"`

---

### Task 6: `CanvasConnect` component on the Account page

**Files:** Create `apps/web/components/CanvasConnect.tsx`; Modify `apps/web/app/(app)/account/page.tsx`

- [ ] **Step 1: Create the component.** `apps/web/components/CanvasConnect.tsx` (mirror `CalendarConnect`'s status-driven structure; Editorial Calm tokens):
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useApi } from '@/lib/use-api';
import { Button } from '@/components/ui/button';
import type { CanvasStatus, CanvasConnectResponse, CanvasUpcomingResponse, UpcomingAssessment } from '@composed-prompts/shared';

const fmtDue = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function CanvasConnect() {
  const { isLoaded, isSignedIn } = useUser();
  const { apiGet, apiPost } = useApi();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [items, setItems] = useState<UpcomingAssessment[]>([]);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    apiGet<CanvasStatus>('/api/me/canvas/status').then((s) => setConnected(s.connected)).catch(() => setConnected(false));
  }, [isLoaded, isSignedIn, apiGet]);

  useEffect(() => {
    if (!connected) return;
    apiGet<CanvasUpcomingResponse>('/api/me/canvas/upcoming')
      .then((r) => { setItems(r.items); if (r.connected === false) setConnected(false); })
      .catch(() => {});
  }, [connected, apiGet]);

  const connect = async () => {
    if (!token.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await apiPost<CanvasConnectResponse>('/api/me/canvas/connect', { token: token.trim() });
      if (res.connected) { setToken(''); setConnected(true); }
      else setError("That token didn't work — double-check you copied the whole thing.");
    } catch { setError('Something went wrong — try again.'); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true);
    try { await apiPost('/api/me/canvas/disconnect', {}); setConnected(false); setItems([]); } catch {}
    finally { setBusy(false); }
  };

  if (!isLoaded || connected === null) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <dt className="text-muted-foreground">Canvas</dt>
      <dd className="mt-1">
        {!connected ? (
          <>
            <p className="text-muted-foreground">Connect Canvas so Composed sees your upcoming assessments automatically.</p>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your Canvas access token"
              className="mt-2 block w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="mt-2 flex items-center gap-3">
              <Button type="button" size="sm" onClick={connect} disabled={busy || !token.trim()}>Connect</Button>
              <button type="button" onClick={() => setShowGuide((v) => !v)} className="text-xs text-primary underline">
                {showGuide ? 'Hide' : 'How do I get my token?'}
              </button>
            </div>
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
            {showGuide && (
              <ol className="mt-3 list-decimal space-y-1 rounded-2xl bg-muted p-3 pl-7 text-xs text-foreground">
                <li>Go to <span className="font-medium">pomfret.instructure.com</span> and sign in.</li>
                <li>Click your profile picture → <span className="font-medium">Account → Settings</span>.</li>
                <li>Scroll to <span className="font-medium">Approved Integrations</span> → <span className="font-medium">+ New Access Token</span>.</li>
                <li>Purpose: type <span className="font-medium">&quot;Composed&quot;</span>, leave the expiry blank → <span className="font-medium">Generate Token</span>.</li>
                <li>Copy the token and paste it above → Connect.</li>
                <li className="text-muted-foreground">Don&apos;t see &quot;+ New Access Token&quot;? Your school may have disabled it — let a teacher know.</li>
              </ol>
            )}
          </>
        ) : (
          <>
            <p className="font-medium text-foreground">Canvas connected ✓</p>
            {items.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-xs text-foreground">
                {items.slice(0, 6).map((i) => (
                  <li key={i.id}>{i.title}{i.course ? ` · ${i.course}` : ''} — due {fmtDue(i.dueDate)}</li>
                ))}
              </ul>
            )}
            <Button type="button" size="sm" variant="outline" onClick={disconnect} disabled={busy} className="mt-2">Disconnect</Button>
          </>
        )}
      </dd>
    </div>
  );
}
```

- [ ] **Step 2: Mount it on the Account page.** In `apps/web/app/(app)/account/page.tsx`, add `import { CanvasConnect } from '@/components/CanvasConnect';` and render `<CanvasConnect />` right after `<CalendarConnect />` inside the `<dl>`.

- [ ] **Step 3: Verify.** `cd apps/web && npx tsc --noEmit` → clean.
- [ ] **Step 4: Commit.** `git add apps/web/components/CanvasConnect.tsx "apps/web/app/(app)/account/page.tsx" && git commit -m "feat(web): CanvasConnect — token guide + connect/disconnect + upcoming list"`

---

### Task 7: Dashboard wiring

**Files:** Modify `apps/web/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Fetch Canvas upcoming + prefer it for "Next assessment".** Add to the dashboard component (alongside the existing history fetch): a `useState<UpcomingAssessment[]>([])` for `canvasItems`, and a second `useEffect` that calls `apiGet<CanvasUpcomingResponse>('/api/me/canvas/upcoming')` (signed-in), setting `canvasItems` (empty on any failure — never throw into the dashboard). Import the types from `@composed-prompts/shared`.
```tsx
  const [canvasItems, setCanvasItems] = useState<UpcomingAssessment[]>([]);
  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    apiGet<CanvasUpcomingResponse>('/api/me/canvas/upcoming')
      .then((r) => setCanvasItems(r.items ?? []))
      .catch(() => setCanvasItems([]));
  }, [isLoaded, isSignedIn, apiGet]);
```
Then the "Next assessment" stat prefers Canvas when present:
```tsx
  const nextAssessmentValue = canvasItems[0]?.dueDate
    ? fmtDate(canvasItems[0].dueDate.slice(0, 10))
    : (stats?.nextAssessment ? fmtDate(stats.nextAssessment) : '—');
```
and use `nextAssessmentValue` in the `statCards` array for "Next assessment".

- [ ] **Step 2: Add an "Upcoming assessments" block** above "Recent prompts", shown only when `canvasItems.length > 0`:
```tsx
      {canvasItems.length > 0 && (
        <>
          <p className="mt-8 mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Upcoming assessments</p>
          <div className="space-y-2">
            {canvasItems.slice(0, 5).map((i) => (
              <div key={i.id} className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
                <div>
                  <div className="text-sm font-medium text-foreground">{i.title}{i.course ? ` · ${i.course}` : ''}</div>
                  <div className="text-xs text-muted-foreground">due {fmtDate(i.dueDate.slice(0, 10))}</div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
```

- [ ] **Step 3: Verify.** `cd apps/web && npx tsc --noEmit && npm run build` → clean, builds.
- [ ] **Step 4: Commit.** `git add "apps/web/app/(app)/dashboard/page.tsx" && git commit -m "feat(web): dashboard sources Next assessment + Upcoming from Canvas"`

---

### Task 8: Whole-feature verification

- [ ] **Step 1: All suites + build.**
```bash
cd /Users/likerun/Desktop/prompt/apps/api && npx vitest run && npx tsc --noEmit
cd /Users/likerun/Desktop/prompt/packages/shared && npx vitest run
cd /Users/likerun/Desktop/prompt/apps/web && npm run build && npx vitest run
```
Expect all green; web build succeeds.
- [ ] **Step 2: Zombie check.** `git status --short`; `rm -rf` `apps/web/app/about/` / `apps/web/components/RagPanel.tsx` if they reappear.
- [ ] **Step 3: Security grep.** Confirm the token is never logged/echoed: `grep -rnE "console\.(log|error).*token|token.*console" apps/api/src/routes/canvas.ts apps/api/src/lib/canvas.ts` → expect nothing; confirm no route returns the token field.
- [ ] **Step 4: `/browse`** (signed-in) the Account page: guide expands, connect rejects a bad token, connected state + Disconnect; dashboard shows Canvas-sourced Next assessment + Upcoming when connected. (Real-token test is the user's, post-deploy.)
- [ ] **Step 5: Whole-feature review.** Dispatch a reviewer over `git diff <task1^>..HEAD` focused on: token never leaves the server / never logged; encryption correct; disconnect + 401-reconnect both null the column; signed-in gating on every route; dashboard degrades gracefully when not connected; no leftover hardcoded colors.

---

## Self-Review

**Spec coverage:** ✅ crypto (T1) · contracts (T2) · canvas client (T3) · schema+migration (T4) · routes+mount+tests (T5) · CanvasConnect+guide (T6) · dashboard surfacing (T7) · verification+security grep+review (T8). Security non-negotiables enforced (encrypt at rest, never to browser, server-side, disconnect deletes, validate on connect). USER ACTIONs (CANVAS_TOKEN_KEY + prod migration) flagged.

**Placeholder scan:** none — full code for crypto, client, routes, component, dashboard edits, and every test.

**Type consistency:** `UpcomingAssessment`/`CanvasStatus`/`CanvasConnectResponse`/`CanvasUpcomingResponse` defined in T2 and used identically in T3/T5/T6/T7; `encryptToken`/`decryptToken` (T1) consumed in T5; `validateToken`/`fetchUpcoming`/`CanvasAuthError` (T3) consumed in T5; the `canvasTokenEnc` column (T4) read/written in T5. Disconnect is POST in both the route (T5) and the component (T6).
