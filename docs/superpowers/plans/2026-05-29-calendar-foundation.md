# Google Calendar Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in student connect their Google Calendar (minimal `calendar.freebusy` scope via Clerk) and see their open blocks for the next 7 days on the account page, read live through a Clerk-vended token.

**Architecture:** A pure shared `computeFreeBlocks` does the gap math. A thin `lib/google-calendar.ts` wraps Google's `freeBusy.query`. A new authed `GET /api/calendar/freebusy` route fetches the Google token from Clerk, reads busy intervals, and returns computed free blocks (graceful `{connected:false}` when not connected). A `<CalendarConnect>` account-page card handles the Clerk re-consent + preview. No token or free/busy storage.

**Tech Stack:** TypeScript, Hono, Clerk (`@clerk/backend`/`@clerk/nextjs`), Google Calendar API, Vitest, Next.js 14.

**Spec:** `docs/superpowers/specs/2026-05-29-calendar-foundation-design.md`

---

## File map

- **Create** `packages/shared/src/calendar.ts` (`Interval` + `computeFreeBlocks`) + `tests/unit/calendar.test.ts`; **Modify** `packages/shared/src/index.ts`, `src/api-contracts.ts`
- **Modify** `apps/api/src/middleware/clerk-auth.ts` (`clerkUserId` on context), `apps/api/tests/helpers/with-user.ts`
- **Create** `apps/api/src/lib/google-calendar.ts` + `tests/integration/google-calendar.test.ts`
- **Create** `apps/api/src/routes/calendar.ts` + `tests/integration/calendar-route.test.ts`; **Modify** `apps/api/src/index.ts`
- **Create** `apps/web/components/CalendarConnect.tsx`; **Modify** `apps/web/app/account/page.tsx`

---

## Task 1: Shared `computeFreeBlocks` (TDD)

**Files:** Create `packages/shared/src/calendar.ts`, `packages/shared/tests/unit/calendar.test.ts`; Modify `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/tests/unit/calendar.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { computeFreeBlocks } from '@composed-prompts/shared';

const W_START = '2026-06-01T00:00:00.000Z';
const W_END = '2026-06-01T10:00:00.000Z'; // 10-hour window

describe('computeFreeBlocks', () => {
  it('returns the whole window when there is no busy time', () => {
    const free = computeFreeBlocks([], W_START, W_END, 30);
    expect(free).toEqual([{ start: W_START, end: W_END }]);
  });

  it('returns the gaps around a busy block', () => {
    const busy = [{ start: '2026-06-01T03:00:00.000Z', end: '2026-06-01T05:00:00.000Z' }];
    const free = computeFreeBlocks(busy, W_START, W_END, 30);
    expect(free).toEqual([
      { start: '2026-06-01T00:00:00.000Z', end: '2026-06-01T03:00:00.000Z' },
      { start: '2026-06-01T05:00:00.000Z', end: '2026-06-01T10:00:00.000Z' },
    ]);
  });

  it('merges overlapping/adjacent busy blocks', () => {
    const busy = [
      { start: '2026-06-01T03:00:00.000Z', end: '2026-06-01T05:00:00.000Z' },
      { start: '2026-06-01T04:30:00.000Z', end: '2026-06-01T06:00:00.000Z' },
    ];
    const free = computeFreeBlocks(busy, W_START, W_END, 30);
    expect(free).toEqual([
      { start: '2026-06-01T00:00:00.000Z', end: '2026-06-01T03:00:00.000Z' },
      { start: '2026-06-01T06:00:00.000Z', end: '2026-06-01T10:00:00.000Z' },
    ]);
  });

  it('drops gaps shorter than minBlockMinutes', () => {
    const busy = [
      { start: '2026-06-01T00:20:00.000Z', end: '2026-06-01T05:00:00.000Z' }, // leaves a 20-min gap at the start
    ];
    const free = computeFreeBlocks(busy, W_START, W_END, 30);
    expect(free).toEqual([{ start: '2026-06-01T05:00:00.000Z', end: '2026-06-01T10:00:00.000Z' }]);
  });

  it('returns [] when busy covers the whole window', () => {
    const busy = [{ start: '2026-05-31T00:00:00.000Z', end: '2026-06-02T00:00:00.000Z' }];
    expect(computeFreeBlocks(busy, W_START, W_END, 30)).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd packages/shared && npx vitest run tests/unit/calendar.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/shared/src/calendar.ts`:
```typescript
export type Interval = { start: string; end: string }; // ISO 8601 strings

// Merge busy intervals (clipped to the window), then return the gaps that are
// at least minBlockMinutes long within [windowStart, windowEnd]. Timezone-agnostic:
// callers render the ISO times in the student's local time.
export function computeFreeBlocks(
  busy: Interval[],
  windowStart: string,
  windowEnd: string,
  minBlockMinutes: number,
): Interval[] {
  const winStart = new Date(windowStart).getTime();
  const winEnd = new Date(windowEnd).getTime();
  const minMs = minBlockMinutes * 60 * 1000;

  const clipped = busy
    .map((b) => ({
      start: Math.max(new Date(b.start).getTime(), winStart),
      end: Math.min(new Date(b.end).getTime(), winEnd),
    }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const b of clipped) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else merged.push({ ...b });
  }

  const free: Interval[] = [];
  let cursor = winStart;
  for (const b of merged) {
    if (b.start - cursor >= minMs) {
      free.push({ start: new Date(cursor).toISOString(), end: new Date(b.start).toISOString() });
    }
    cursor = Math.max(cursor, b.end);
  }
  if (winEnd - cursor >= minMs) {
    free.push({ start: new Date(cursor).toISOString(), end: new Date(winEnd).toISOString() });
  }
  return free;
}
```

- [ ] **Step 4: Export from the barrel**

In `packages/shared/src/index.ts`, add after the `export * from './grade.js';` line:
```typescript
export * from './calendar.js';
```

- [ ] **Step 5: Run, verify it passes**

Run: `cd packages/shared && npx vitest run tests/unit/calendar.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/calendar.ts packages/shared/src/index.ts packages/shared/tests/unit/calendar.test.ts
git commit -m "feat(shared): computeFreeBlocks + Interval type"
```

---

## Task 2: `CalendarFreeBusyResponse` contract

**Files:** Modify `packages/shared/src/api-contracts.ts`

- [ ] **Step 1: Add the type**

In `packages/shared/src/api-contracts.ts`, add an import of `Interval` at the top (next to the existing `import type { WizardInputs, StudyMode } from './types.js';`):
```typescript
import type { Interval } from './calendar.js';
```
and add at the end of the file:
```typescript
// GET /api/calendar/freebusy
export type CalendarFreeBusyResponse =
  | { connected: false }
  | { connected: true; busy: Interval[]; freeBlocks: Interval[] };
```

- [ ] **Step 2: Type-check + commit**

Run: `cd packages/shared && npx tsc --noEmit`
Expected: no errors.
```bash
git add packages/shared/src/api-contracts.ts
git commit -m "feat(shared): CalendarFreeBusyResponse contract"
```

---

## Task 3: `clerkUserId` on the request user context

**Files:** Modify `apps/api/src/middleware/clerk-auth.ts`, `apps/api/tests/helpers/with-user.ts`

- [ ] **Step 1: Add it to the context**

In `apps/api/src/middleware/clerk-auth.ts`:
- Change the `ContextVariableMap` `user` type to add `clerkUserId`:
```typescript
    user: { id: string; email: string; displayName: string | null; gradYear: number | null; clerkUserId: string } | null;
```
- Change the `c.set('user', { ... })` line to include it:
```typescript
    c.set('user', { id: user.id, email: user.email, displayName: user.displayName, gradYear: user.gradYear, clerkUserId: user.clerkUserId });
```
(`getOrCreateUser` already returns `clerkUserId` on its `LocalUser`.)

- [ ] **Step 2: Update the test stub type**

In `apps/api/tests/helpers/with-user.ts`, add `clerkUserId` (optional, so existing callers still run):
```typescript
export type TestUser = { id: string; email: string; displayName: string | null; gradYear?: number | null; clerkUserId?: string } | null;
```

- [ ] **Step 3: Type-check + commit**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors.
```bash
git add apps/api/src/middleware/clerk-auth.ts apps/api/tests/helpers/with-user.ts
git commit -m "feat(api): expose clerkUserId on the request user context"
```

---

## Task 4: `lib/google-calendar.ts` — fetch busy intervals (TDD)

**Files:** Create `apps/api/src/lib/google-calendar.ts`, `apps/api/tests/integration/google-calendar.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/integration/google-calendar.test.ts`:
```typescript
import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchBusyIntervals, CalendarAuthError } from '@/lib/google-calendar';

afterEach(() => vi.restoreAllMocks());

describe('fetchBusyIntervals', () => {
  it('posts to the freeBusy endpoint and parses primary busy', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ calendars: { primary: { busy: [{ start: 'a', end: 'b' }] } } }), { status: 200 }),
    );
    const busy = await fetchBusyIntervals('tok', '2026-06-01T00:00:00Z', '2026-06-08T00:00:00Z');
    expect(busy).toEqual([{ start: 'a', end: 'b' }]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/calendar/v3/freeBusy');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('returns [] when there is no busy array', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ calendars: {} }), { status: 200 }));
    expect(await fetchBusyIntervals('tok', 'a', 'b')).toEqual([]);
  });

  it('throws CalendarAuthError on 401/403', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('no', { status: 403 }));
    await expect(fetchBusyIntervals('tok', 'a', 'b')).rejects.toBeInstanceOf(CalendarAuthError);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd apps/api && npm test -- tests/integration/google-calendar.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `apps/api/src/lib/google-calendar.ts`:
```typescript
import type { Interval } from '@composed-prompts/shared';

export class CalendarAuthError extends Error {}

// Reads busy intervals from the user's primary Google Calendar via freeBusy.query.
export async function fetchBusyIntervals(
  googleToken: string,
  timeMin: string,
  timeMax: string,
): Promise<Interval[]> {
  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${googleToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ timeMin, timeMax, items: [{ id: 'primary' }] }),
  });
  if (res.status === 401 || res.status === 403) {
    throw new CalendarAuthError(`google freebusy auth error ${res.status}`);
  }
  if (!res.ok) {
    throw new Error(`google freebusy failed ${res.status}`);
  }
  const data = (await res.json()) as { calendars?: { primary?: { busy?: Interval[] } } };
  return data.calendars?.primary?.busy ?? [];
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `cd apps/api && npm test -- tests/integration/google-calendar.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/google-calendar.ts apps/api/tests/integration/google-calendar.test.ts
git commit -m "feat(api): google-calendar freeBusy wrapper"
```

---

## Task 5: `GET /api/calendar/freebusy` route (TDD)

**Files:** Create `apps/api/src/routes/calendar.ts`, `apps/api/tests/integration/calendar-route.test.ts`; Modify `apps/api/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/integration/calendar-route.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { withUser, type TestUser } from '../helpers/with-user';

const mockGetToken = vi.fn();
vi.mock('@/lib/clerk', () => ({ clerkClient: { users: { getUserOauthAccessToken: mockGetToken } } }));

const mockFetchBusy = vi.fn();
class CalendarAuthError extends Error {}
vi.mock('@/lib/google-calendar', () => ({ fetchBusyIntervals: mockFetchBusy, CalendarAuthError }));

import { calendar } from '@/routes/calendar';

const USER: TestUser = { id: 'u1', email: 'e@test.com', displayName: null, gradYear: null, clerkUserId: 'clerk_1' };
const appFor = (user: TestUser) => {
  const a = new Hono();
  a.use('*', withUser(user));
  a.route('/', calendar);
  return a;
};

describe('GET /api/calendar/freebusy', () => {
  beforeEach(() => {
    mockGetToken.mockReset();
    mockFetchBusy.mockReset();
  });

  it('401 when anonymous', async () => {
    const res = await appFor(null).request('/api/calendar/freebusy');
    expect(res.status).toBe(401);
  });

  it('returns connected:false when Clerk has no Google token', async () => {
    mockGetToken.mockResolvedValue({ data: [] });
    const res = await appFor(USER).request('/api/calendar/freebusy');
    expect(await res.json()).toEqual({ connected: false });
  });

  it('returns free blocks computed from busy', async () => {
    mockGetToken.mockResolvedValue({ data: [{ token: 'ya29' }] });
    mockFetchBusy.mockResolvedValue([]); // no busy -> one full-window free block
    const res = await appFor(USER).request('/api/calendar/freebusy?days=1');
    const body = await res.json();
    expect(body.connected).toBe(true);
    expect(body.freeBlocks.length).toBe(1);
  });

  it('returns connected:false on a calendar auth error', async () => {
    mockGetToken.mockResolvedValue({ data: [{ token: 'ya29' }] });
    mockFetchBusy.mockRejectedValue(new CalendarAuthError('scope missing'));
    const res = await appFor(USER).request('/api/calendar/freebusy');
    expect(await res.json()).toEqual({ connected: false });
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd apps/api && npm test -- tests/integration/calendar-route.test.ts`
Expected: FAIL — `@/routes/calendar` not found.

- [ ] **Step 3: Implement the route**

Create `apps/api/src/routes/calendar.ts`:
```typescript
import { Hono } from 'hono';
import { computeFreeBlocks } from '@composed-prompts/shared';
import { clerkClient } from '../lib/clerk.js';
import { fetchBusyIntervals, CalendarAuthError } from '../lib/google-calendar.js';

export const calendar = new Hono();

calendar.get('/api/calendar/freebusy', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  const days = Math.min(Math.max(parseInt(c.req.query('days') ?? '7', 10) || 7, 1), 31);
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  // Clerk vends the Google OAuth token (provider string may be 'google' or
  // 'oauth_google' depending on the @clerk/backend version — match yours).
  let googleToken: string | null = null;
  try {
    const res = await clerkClient.users.getUserOauthAccessToken(user.clerkUserId, 'google');
    googleToken = res.data?.[0]?.token ?? null;
  } catch {
    googleToken = null;
  }
  if (!googleToken) return c.json({ connected: false }, 200);

  try {
    const busy = await fetchBusyIntervals(googleToken, timeMin, timeMax);
    const freeBlocks = computeFreeBlocks(busy, timeMin, timeMax, 30);
    return c.json({ connected: true, busy, freeBlocks }, 200);
  } catch (err) {
    if (err instanceof CalendarAuthError) return c.json({ connected: false }, 200);
    console.error('calendar freebusy failed', { message: err instanceof Error ? err.message : String(err) });
    return c.json({ error: 'calendar unavailable' }, 502);
  }
});
```

- [ ] **Step 4: Mount the route**

In `apps/api/src/index.ts`:
- Add the import after the `me` import: `import { calendar } from './routes/calendar.js';`
- Add the mount after `app.route('/', me);`: `app.route('/', calendar);`

- [ ] **Step 5: Run, verify it passes**

Run: `cd apps/api && npm test -- tests/integration/calendar-route.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/calendar.ts apps/api/src/index.ts apps/api/tests/integration/calendar-route.test.ts
git commit -m "feat(api): GET /api/calendar/freebusy (Clerk-vended Google token)"
```

---

## Task 6: Account-page `CalendarConnect` component

**Files:** Create `apps/web/components/CalendarConnect.tsx`; Modify `apps/web/app/account/page.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/components/CalendarConnect.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useApi } from '@/lib/use-api';
import type { CalendarFreeBusyResponse, Interval } from '@composed-prompts/shared';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.freebusy';

const fmt = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

const btn =
  'mt-2 rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700';

export function CalendarConnect() {
  const { isLoaded, user } = useUser();
  const { apiGet } = useApi();
  const [data, setData] = useState<CalendarFreeBusyResponse | null>(null);

  const google = user?.externalAccounts.find((a) => a.provider === 'google');
  const connected = Boolean(google?.approvedScopes?.includes(CALENDAR_SCOPE));

  useEffect(() => {
    if (!connected) return;
    apiGet<CalendarFreeBusyResponse>('/api/calendar/freebusy')
      .then(setData)
      .catch(() => setData({ connected: false }));
  }, [connected, apiGet]);

  // NOTE: verify externalAccount.reauthorize's shape against the installed
  // @clerk/nextjs version; it returns a verification with an external redirect URL.
  const onConnect = async (): Promise<void> => {
    if (!google) return;
    const res = await google.reauthorize({
      additionalScopes: [CALENDAR_SCOPE],
      redirectUrl: `${window.location.origin}/account`,
    });
    const url = res.verification?.externalVerificationRedirectURL;
    if (url) window.location.href = url.toString();
  };

  if (!isLoaded) return null;

  return (
    <div>
      <dt className="text-slate-500">Google Calendar</dt>
      <dd className="mt-1">
        {!connected ? (
          <>
            <p className="text-slate-600">
              {google
                ? 'Connect your Google Calendar so Composed can see your open study blocks.'
                : 'Add a Google account (avatar menu, top-right) to connect your calendar.'}
            </p>
            {google && (
              <button type="button" onClick={onConnect} className={btn}>
                Connect Google Calendar
              </button>
            )}
          </>
        ) : data === null ? (
          <span className="text-slate-500">Checking your calendar…</span>
        ) : data.connected === false ? (
          <>
            <p className="text-slate-600">Couldn&apos;t read your calendar — reconnect.</p>
            <button type="button" onClick={onConnect} className={btn}>Reconnect</button>
          </>
        ) : (
          <>
            <p className="font-medium">Google Calendar connected ✓</p>
            {data.freeBlocks.length === 0 ? (
              <p className="mt-1 text-slate-500">No open blocks found in the next 7 days.</p>
            ) : (
              <>
                <p className="mt-1 text-slate-500">Your open blocks over the next 7 days:</p>
                <ul className="mt-1 list-disc pl-5 text-xs text-slate-700">
                  {data.freeBlocks.slice(0, 8).map((b: Interval, i: number) => (
                    <li key={i}>{fmt(b.start)} – {fmt(b.end)}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </dd>
    </div>
  );
}
```

- [ ] **Step 2: Render it on the account page**

In `apps/web/app/account/page.tsx`:
- Add the import: `import { CalendarConnect } from '@/components/CalendarConnect';`
- Inside the `<dl className="mt-6 grid gap-3 text-sm">`, immediately AFTER the Grade `<div>…</div>` block and BEFORE the `{me?.profileSummary && (…)}` block, add:
```tsx
        <CalendarConnect />
```

- [ ] **Step 3: Build**

Run: `cd apps/web && npm run build`
Expected: compiles; `/account` builds with no type errors. (If `reauthorize`'s argument/return shape errors against the installed `@clerk/nextjs`, adjust per its types — this is the one Clerk-version-specific call.)

- [ ] **Step 4: Commit**

```bash
git add apps/web/components/CalendarConnect.tsx apps/web/app/account/page.tsx
git commit -m "feat(web): CalendarConnect account-page card (connect + free/busy preview)"
```

---

## Task 7: [USER ACTION] Google Cloud + Clerk calendar-scope setup

No code. Needed before the live/manual verification (not for the automated tests, which mock Clerk + Google).

- [ ] **Step 1: Google Cloud OAuth client**

In Google Cloud Console: create (or reuse) an OAuth 2.0 Client ID (Web application). On the OAuth consent screen, add the scope `https://www.googleapis.com/auth/calendar.freebusy`. Add the redirect URI that Clerk shows for its Google connection.

- [ ] **Step 2: Clerk custom credentials**

In Clerk → SSO/Social Connections → Google → switch to **custom credentials**, paste the Google client ID + secret, and enable the `calendar.freebusy` scope.

- [ ] **Step 3: Dev test users**

Because `calendar.freebusy` is a Google "sensitive" scope, add your test student account(s) as **test users** on the OAuth consent screen so consent works without full app verification. (Production needs Google verification or a Workspace-internal client.)

- [ ] **Step 4: Ensure the backend has its Clerk secret**

Confirm `CLERK_SECRET_KEY` is set wherever the API runs (already a Fly secret in prod; add to `apps/api/.env` for local dev). The calendar route + clerk-auth both need it at runtime.

---

## Task 8: Full verification

**Files:** none

- [ ] **Step 1: Shared + API + web automated checks**

```bash
cd packages/shared && npx vitest run            # all pass (incl. calendar)
cd apps/api && npm test                          # all pass (incl. google-calendar, calendar-route)
cd apps/web && npm run build && npx vitest run   # build compiles; existing web tests pass
```

- [ ] **Step 2: Confirm a clean tree**

Run: `git status --short`
Expected: empty (no stray/untracked files).

- [ ] **Step 3: [MANUAL, after Task 7 + deploy] Live smoke**

After `git push` (Vercel) + `fly deploy` (backend), sign in, open `/account`, click **Connect Google Calendar**, complete Google consent, and confirm the card flips to "connected ✓" and lists your open blocks. (Automated tests can't exercise the real Clerk re-consent.)

---

## Notes for the implementer

- **Tests mock the externals** (`@/lib/clerk`, `@/lib/google-calendar`, and `global.fetch`), so they need neither `CLERK_SECRET_KEY` nor network/Google access. Do NOT import the real `lib/clerk` in a test without mocking it (it throws when `CLERK_SECRET_KEY` is unset).
- **No storage** — no DB column, no migration; the token lives in Clerk, free/busy is read live.
- **`computeFreeBlocks` is timezone-agnostic** (gaps in absolute time); the daytime/working-hours filtering is intentionally a later spec.
- **The one external-SDK uncertainty** is `externalAccount.reauthorize` (Task 6) — verify its argument/return shape against the installed `@clerk/nextjs` 6.x; everything else is standard.
