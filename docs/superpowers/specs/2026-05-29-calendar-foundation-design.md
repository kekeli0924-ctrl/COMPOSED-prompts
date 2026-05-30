# Google Calendar Foundation (Connect + Read Availability) — Design Spec

**Date:** 2026-05-29
**Status:** Approved (brainstorming) → ready for implementation plan
**Product:** Composed (Pomfret study-prompt generator)

## Context: this is Spec 1 of 3

The full "Google Calendar + study reminders" feature decomposes into three sequenced specs:

1. **This spec — Foundation: connect Google Calendar + read availability.** (Read-only `free/busy`.)
2. **Availability preferences** — a weekly editor for windows the student is unavailable vs. wants to study.
3. **Schedule + deliver** — compute study blocks from `hoursAvailable` + `assessmentDate` + free/busy + preferences, and **write them to the student's Google Calendar as events** (Google's native reminders become the delivery channel — no email/push infra needed).

This spec deliberately stops at "Composed can see your open study blocks," to de-risk the OAuth/scopes/re-consent path before anything depends on it.

## Goal

Let a signed-in student connect their Google Calendar (granting the minimal `calendar.freebusy` scope via Clerk) and see their open blocks for the next 7 days on the account page — with the backend reading free/busy live via a Clerk-vended Google token and storing nothing.

## Non-goals (out of scope here)

- No write access to the calendar; no event creation (Spec 3).
- No availability-preferences editor / "preferred study windows" (Spec 2).
- No daytime/working-hours filtering of free blocks, no scheduling logic (Spec 3).
- No token storage and no free/busy storage — token stays in Clerk; availability is read on demand.
- No reminders/notifications.

## Decisions (settled in brainstorming)

- **Approach:** Clerk-vended Google token; backend reads free/busy on demand; account-page UI. (Not frontend-direct-to-Google; not store-the-token.)
- **Scope:** `https://www.googleapis.com/auth/calendar.freebusy` only (Composed sees *when* you're busy, not event details).

## Design

### 1. Setup (user actions) + scope

Requesting a Google calendar scope requires **your own Google Cloud OAuth credentials** wired into Clerk (Clerk's shared dev Google credentials can't carry custom scopes). One-time setup:

- Create a Google Cloud OAuth client; on its consent screen add the scope `https://www.googleapis.com/auth/calendar.freebusy`.
- In Clerk → Google social connection → use **custom credentials** (paste the client ID/secret) and enable the `calendar.freebusy` scope.
- **Dev/testing:** `calendar.freebusy` is a Google "sensitive" scope. Add the test student account(s) as test users on the OAuth consent screen so consent works without full app verification.
- **Production note (not a blocker for building):** real production use of a sensitive scope needs either Google's app verification or restricting the OAuth client to a Google Workspace org (e.g., `pomfret.org`).

### 2. Connect / re-consent flow (frontend, via Clerk)

Existing users granted Google before this scope existed, so their token lacks it. Connection state is read client-side from Clerk:

- Find the Google account: `useUser().user.externalAccounts.find(a => a.provider === 'google')` (match Clerk's actual provider string).
- **Connected** iff that account's `approvedScopes` includes `…/calendar.freebusy`.
- **Connect button** calls `externalAccount.reauthorize({ additionalScopes: ['https://www.googleapis.com/auth/calendar.freebusy'], redirectUrl: '/account' })` → Google consent → returns to `/account` with the upgraded token; `approvedScopes` now includes it.
- Edge: a student with no Google external account at all (email sign-up) sees a note to add Google first.

### 3. Backend — token + free/busy endpoint

- **`apps/api/src/middleware/clerk-auth.ts`** — add `clerkUserId` to the request `user` context (it's already on the `LocalUser` from `getOrCreateUser`); needed to fetch the Google token.
- **`apps/api/src/lib/google-calendar.ts` (new)** — `fetchBusyIntervals(googleToken, timeMin, timeMax): Promise<Interval[]>` wraps the Google `freeBusy.query` call (`POST https://www.googleapis.com/calendar/v3/freeBusy`, `Authorization: Bearer <token>`, body `{ timeMin, timeMax, items: [{ id: 'primary' }] }`), parses `calendars.primary.busy`. Isolated so it's mockable in tests. Throws a typed error on 401/403 (auth/scope) vs other failures.
- **`apps/api/src/routes/calendar.ts` (new)** — `GET /api/calendar/freebusy?days=7` (authed; 401 if anonymous):
  - Fetch the Google token: `clerkClient.users.getUserOauthAccessToken(user.clerkUserId, 'google')`; read the access token from the result. Missing token → `{ connected: false }` (200).
  - `timeMin = now`, `timeMax = now + days` (default 7, clamp 1–31).
  - Call `fetchBusyIntervals`; on auth/scope error → `{ connected: false }` (200). On other error → 502 `{ error }`.
  - `freeBlocks = computeFreeBlocks(busy, timeMin, timeMax, 30)`.
  - Return `{ connected: true, busy, freeBlocks }`.
  - Mount in `apps/api/src/index.ts`.
- **`packages/shared/src/calendar.ts` (new)** — pure, dependency-free:
  ```ts
  export type Interval = { start: string; end: string }; // ISO strings
  // Merge busy intervals, then return the gaps >= minBlockMinutes within
  // [windowStart, windowEnd]. Timezone-agnostic (frontend renders in local time).
  export function computeFreeBlocks(
    busy: Interval[], windowStart: string, windowEnd: string, minBlockMinutes: number,
  ): Interval[];
  ```
  Export from `packages/shared/src/index.ts`.
- **`packages/shared/src/api-contracts.ts`** — import `Interval` from `./calendar.js` and add:
  ```ts
  export type CalendarFreeBusyResponse =
    | { connected: false }
    | { connected: true; busy: Interval[]; freeBlocks: Interval[] };
  ```

### 4. Account-page UI

- **`apps/web/components/CalendarConnect.tsx` (new)** — a self-contained "Google Calendar" card with the three states:
  1. **Not connected** → blurb + Connect button (`reauthorize` as above).
  2. **Connected** → "Google Calendar connected ✓" + a live preview from `useApi().apiGet<CalendarFreeBusyResponse>('/api/calendar/freebusy')`: "Your open blocks over the next 7 days:" listing each `freeBlock` rendered in local time (e.g., "Tue, 2:00–6:00 PM"); empty → "No open blocks found." A `connected:false` response (revoked/expired token) shows the reconnect prompt.
  3. **Loading / error** → "Checking your calendar…" / "Couldn't read your calendar — reconnect."
- **`apps/web/app/account/page.tsx`** — render `<CalendarConnect />` in the account `<dl>` (after Grade).

## Testing

- **`packages/shared` (Vitest):** `computeFreeBlocks` — no busy → one full-window block (if ≥ min); merges overlapping/adjacent busy; returns gaps between busy; drops gaps < `minBlockMinutes`; all-busy → `[]`; respects `windowStart`/`windowEnd` bounds.
- **`apps/api` (Vitest):** `GET /api/calendar/freebusy` — 401 anonymous; `{ connected: false }` when Clerk returns no Google token (mock `clerkClient.users.getUserOauthAccessToken`); `{ connected: true, freeBlocks }` parsed from a mocked `fetchBusyIntervals`; `connected: false` when `fetchBusyIntervals` throws the auth/scope error.
- **`apps/web`:** build + type-check; the Clerk reauthorize + card UI is verified by a manual/browser pass (not unit-testable).

## Files touched (summary)

- `packages/shared/src/calendar.ts` (new — defines `Interval` + `computeFreeBlocks`) + `index.ts` export + `api-contracts.ts` (`CalendarFreeBusyResponse`, importing `Interval`)
- `apps/api/src/middleware/clerk-auth.ts` (`clerkUserId` on context)
- `apps/api/src/lib/google-calendar.ts` (new)
- `apps/api/src/routes/calendar.ts` (new) + `apps/api/src/index.ts` (mount)
- `apps/web/components/CalendarConnect.tsx` (new) + `apps/web/app/account/page.tsx`
- tests in `packages/shared/tests/unit/` and `apps/api/tests/integration/`

## Future (next specs)

Spec 2 adds the availability-preferences editor; Spec 3 adds scheduling (`hoursAvailable` + `assessmentDate` + free/busy + preferences → study blocks) and writes them to the calendar as events — at which point we request the `calendar.events` write scope (a second, purposeful consent).
