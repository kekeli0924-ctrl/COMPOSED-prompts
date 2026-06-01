# Canvas Integration (v1) — Design Spec

**Date:** 2026-05-31
**Status:** Approved (brainstorming)
**Topic:** Let a student connect their Canvas account (via a personal access token) so the system can see real upcoming assessments, with a step-by-step token guide for students who don't know how.

---

## Goal

A signed-in student connects Pomfret Canvas with a personal access token; the system fetches their **upcoming assessments** (assignment/quiz due dates) and surfaces them on the dashboard ("Next assessment" stat + an "Upcoming assessments" list). A guided walkthrough on the Account page makes getting the token easy.

## Decided specifics (from brainstorming)

1. **Encrypted storage + auto-refresh.** The token is stored (encrypted at rest); the system refreshes upcoming assessments on demand without re-pasting.
2. **One fixed instance:** `https://pomfret.instructure.com` (hardcoded). The guide is tailored to Pomfret's Canvas.
3. **v1 surfaces:** dashboard "Next assessment" stat (real Canvas dates) + an "Upcoming assessments" list.
4. **Placement:** a "Connect Canvas" section on the **Account page**, with the token guide inline.

## Security — non-negotiables

A Canvas personal access token is **full access** to the student's Canvas account and cannot be scoped. Therefore:
- **Encrypted at rest** with **AES-256-GCM**; key from a **Fly secret `CANVAS_TOKEN_KEY`** (32 bytes), never in the repo.
- The token is **never returned to the browser** and **never logged** (no token in responses, errors, or console).
- **All Canvas calls are server-side only** (the API holds + uses the token; the browser never sees it).
- **Disconnect deletes** the stored token (sets the column to NULL).
- **Validate on connect** (a test call) so a bad/expired token fails fast and is never stored if invalid.

## Data model

Add one nullable column to `users` (additive migration via drizzle-kit, like `grad_year`):
- `canvasTokenEnc: text('canvas_token_enc')` — the encrypted token blob, or NULL when not connected. **Connection status = (`canvas_token_enc IS NOT NULL`).**

Migration: edit `apps/api/src/schema.ts` → `npm run db:generate` (creates `apps/api/drizzle/0005_*.sql`) → apply with `db:migrate` against the prod `DATABASE_URL` (a USER ACTION — it's an additive nullable column, safe).

## Encryption — `apps/api/src/lib/crypto.ts`

`node:crypto` (already used in this codebase). Two functions:
- `encryptToken(plaintext: string): string` — random 12-byte IV, AES-256-GCM with the key from `CANVAS_TOKEN_KEY`, returns a self-describing base64 blob `base64(iv) + ':' + base64(authTag) + ':' + base64(ciphertext)`.
- `decryptToken(blob: string): string` — reverses it; throws on auth-tag mismatch / malformed input.
- Key loading: `CANVAS_TOKEN_KEY` is a 32-byte key provided base64-encoded; the util validates its decoded length is 32 and throws a clear error otherwise. Missing key → operations fail closed (cannot connect/fetch).
- Unit-tested: round-trip (encrypt→decrypt === original), tamper (modified blob → throws), distinct IVs (two encrypts of the same text differ).

## Canvas client — `apps/api/src/lib/canvas.ts`

Base URL constant `https://pomfret.instructure.com`. All requests send `Authorization: Bearer <token>`, a short timeout, and `maxRetries`-style guard.
- `validateToken(token): Promise<{ ok: true; name: string } | { ok: false }>` — `GET /api/v1/users/self`; ok when 200.
- `fetchUpcoming(token): Promise<UpcomingAssessment[]>` — `GET /api/v1/users/self/upcoming_events`; from the returned items keep those that are assignments with a future `due_at`; normalize to `UpcomingAssessment` (below), sort by `dueDate` ascending. (If `upcoming_events` proves too narrow during implementation, fall back to active courses → `GET /api/v1/courses/:id/assignments?bucket=upcoming`; the plan picks the working one against the live Canvas API. Document whichever is used.)
- Errors: a Canvas `401` → surface a typed `CanvasAuthError` (token expired/revoked → UI prompts reconnect); other failures → a generic typed error. **Never include the token in any thrown message or log.**

## Shared contract — `packages/shared/src/api-contracts.ts`

```ts
export type UpcomingAssessment = {
  id: string;
  title: string;        // assignment/quiz name
  course: string | null; // course name
  dueDate: string;      // ISO
  type: string;         // 'assignment' | 'quiz' | …
  url: string | null;   // Canvas html_url (optional deep link)
};
export type CanvasStatus = { connected: boolean };
```

## API routes — `apps/api/src/routes/canvas.ts` (mounted in index.ts; all signed-in only → 401 anon)

- `GET  /api/me/canvas/status` → `{ connected }` (from the column).
- `POST /api/me/canvas/connect` body `{ token: string }` → `validateToken`; on ok, `encryptToken` + store, return `{ connected: true }` (NO token echoed); on invalid token → `{ connected: false, reason: 'invalid-token' }` (200, never stores).
- `GET  /api/me/canvas/upcoming` → if not connected `{ connected: false, items: [] }`; else decrypt → `fetchUpcoming` → `{ connected: true, items }`; on `CanvasAuthError` → clear the stored token (it's dead) and return `{ connected: false, reason: 'reconnect' }`.
- `DELETE /api/me/canvas` → set `canvas_token_enc` = NULL, return `{ connected: false }`.

## Connect UI — `apps/web/components/CanvasConnect.tsx` (Account page)

A "Connect Canvas" card (Editorial Calm tokens), reading `/api/me/canvas/status`:
- **Not connected:** a short intro + a **token field** + a **Connect** button, and an expandable **"How to get your Canvas token"** guide tailored to Pomfret:
  1. Go to **pomfret.instructure.com** and sign in.
  2. Click your **profile picture → Account → Settings**.
  3. Scroll to **Approved Integrations** → **+ New Access Token**.
  4. Purpose: type **"Composed"**; leave the expiry blank (or set one) → **Generate Token**.
  5. **Copy** the token and **paste it here** → Connect.
  - Note: *"Don't see '+ New Access Token'? Your school may have disabled personal tokens — let your teacher know."*
  - Invalid-token response → inline "That token didn't work — double-check you copied the whole thing."
- **Connected:** "Connected to Canvas ✓", a **Disconnect** button (deletes the token), and the **Upcoming assessments** list (title · course · due date).

The token field warns it's sensitive; on submit the token goes straight to the API over HTTPS and is cleared from component state.

## Surfacing on the dashboard

- The dashboard fetches `/api/me/canvas/upcoming`. When connected with items: the **"Next assessment"** stat = the soonest Canvas `dueDate` (overrides the prompt-derived value), and a small **"Upcoming"** list shows the next few. When not connected: today's prompt-derived behavior is unchanged.

## Out of scope (v1)

- Pre-filling the wizard's assessment type/date from Canvas (**v2**).
- OAuth (personal tokens only); other schools/instances; background/scheduled sync (fetch on demand; light client-side caching is fine).
- Showing grades or anything beyond assessment titles + due dates.

## Risks / notes

- **Tokens may be disabled** by the Canvas admin → the guide calls this out; `validateToken` failing is handled.
- **Token expiry/revocation** → Canvas 401 → auto-clear + prompt reconnect.
- **Rate limits / Canvas downtime** → `/upcoming` degrades to `{ connected: true, items: [] }` with a soft "couldn't reach Canvas" note; never crashes the dashboard.
- **Key management** → losing/rotating `CANVAS_TOKEN_KEY` invalidates all stored tokens (students re-connect); acceptable, documented.

## USER ACTION

1. Generate a 32-byte key and set it: `fly secrets set CANVAS_TOKEN_KEY=$(openssl rand -base64 32) -a composed-prompts-api` (I'll run it with your OK).
2. Apply the additive migration to the prod DB (`db:migrate` against the prod `DATABASE_URL`).
3. Each student generates their own Canvas token via the in-app guide.

## Verification

- Unit: `crypto.ts` (round-trip, tamper-throws, distinct IVs); `canvas.ts` with mocked `fetch` (validate ok/401, fetchUpcoming normalize + future-only + sort, token never in errors).
- Integration: `canvas` routes (401 anon; connect with a mocked-valid + mocked-invalid token; upcoming connected/not/401-reconnect; disconnect nulls the column) — mock the Canvas client, seed a real user row (UUID).
- `apps/api` + `packages/shared` + `apps/web` suites green; `tsc` clean; web `npm run build`.
- `/browse` (signed-in) the Account page: guide expands, connect/disconnect flow, upcoming list; dashboard shows the Canvas-sourced "Next assessment". (Live token test is the user's, post-deploy.)
