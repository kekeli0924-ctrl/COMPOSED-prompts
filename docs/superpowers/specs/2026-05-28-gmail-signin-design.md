# Design: Gmail (Google) sign-in via Clerk

**Date:** 2026-05-28
**Status:** Approved (pending spec review)
**Supersedes:** the custom Lucia email/password auth from `2026-05-27-backend-service-design.md` (Phase C)

## Goal

Let users sign in to Composed with Google ("Sign in with Gmail"), alongside
email/password. Adopt the industry-standard approach: a managed identity
provider (Clerk) owns authentication, rather than self-hosting auth with
Lucia + Arctic.

## Decision log (from brainstorming)

1. **Provider: Clerk.** Chosen over self-managed Lucia + Arctic. Rationale:
   authentication is high-stakes and adversarial; a managed provider gives MFA,
   passkeys, breach-password detection, brute-force defense, account recovery,
   and a dedicated security team for free. "Best engineering practice" was the
   user's stated priority, with effort explicitly not a constraint.
2. **Replaces, not augments, Lucia.** The custom auth shipped on 2026-05-28
   (signup/login/logout, Lucia sessions, bcrypt) is removed. Only throwaway test
   users exist, so no data migration.
3. **Account linking:** link accounts with the same verified email (a Google
   sign-in and an email/password account on the same address resolve to one
   user). Handled natively by Clerk's dashboard setting.
4. **Auth UI:** Clerk's prebuilt components (`<SignIn>`, `<SignUp>`,
   `<UserButton>`), themed via the `appearance` prop to match Composed's brand.
   Chosen over headless hooks + custom UI to keep Clerk's built-in protections.
5. **Both methods stay:** email/password AND Google, both provided by Clerk's
   widgets.

## Architecture

Clerk becomes the identity provider. The two existing services keep their roles
but change how they trust a request.

```
┌────────────────────────┐   Bearer JWT (Clerk)   ┌────────────────────────┐
│ apps/web (Next/Vercel) │ ─────────────────────► │ apps/api (Hono/Fly)    │
│ <ClerkProvider>        │   Authorization header  │ verifies token w/      │
│ Clerk widgets + session│ ◄───────────────────── │ @clerk/backend, then    │
│ getToken() per request │       JSON              │ JIT-provisions local    │
└────────────────────────┘                         │ users row, maps to FKs  │
         │ Clerk's own auth flows                   └────────────────────────┘
         ▼ (to Clerk's domains)                                │
   accounts.google.com / Clerk Frontend API                    ▼
                                              Postgres: users(+clerk_user_id),
                                              generations, feedback,
                                              user_profiles (unchanged FKs)
```

**Auth model: Bearer tokens, not cookies.** The frontend holds the Clerk
session and attaches a short-lived Clerk-issued JWT (`getToken()`, auto-
refreshed) as `Authorization: Bearer <token>` on each API call. The Hono
backend verifies it with `@clerk/backend`. This is Clerk's documented pattern
for a separate backend and sidesteps the cross-site cookie problem (SameSite /
domains) entirely — tokens are origin-agnostic.

**Proxy stays.** The `/api/*` → Fly rewrite in `next.config.mjs` remains; the
Bearer header rides through it. Clerk's Next.js middleware matcher is configured
to **exclude `/api/*`** so it never touches proxied calls (the backend
self-verifies).

**Identity mapping (JIT provisioning).** Clerk user IDs are strings
(`user_2abc…`). Domain tables keep their `uuid` `user_id` FKs. The first time a
verified request arrives for an unknown Clerk ID, the backend inserts a local
`users` row (`clerk_user_id` + email/name from token claims) and uses its
`uuid` downstream. Idempotent, keyed on `clerk_user_id`. No webhooks in v1
(noted as a future enhancement for handling deletions/profile sync).

## Data model

One new Drizzle migration:

- `users`: **add** `clerk_user_id text not null unique`; **drop**
  `password_hash`. Keep `id` (uuid PK — all existing FKs stay), `email`
  (unique, not null), `display_name`, `created_at`.
- **Drop** the `sessions` table (Clerk owns sessions).
- `generations`, `feedback`, `user_profiles`, `rate_limit_log`, `daily_spend`:
  **unchanged.**

Safe to alter/drop directly — only throwaway test rows exist.

## Backend (apps/api)

- **New** `lib/clerk.ts` — Clerk backend client + `verifyToken` helper keyed off
  `CLERK_SECRET_KEY`.
- **New** `middleware/clerk-auth.ts` (replaces `middleware/session.ts`) — reads
  `Authorization: Bearer`, verifies the JWT, resolves the user via
  `getOrCreateUser`, sets `c.get('user')` or `null`. No/invalid token →
  anonymous (preserves today's anonymous-allowed behavior).
- **New** `getOrCreateUser(clerkUserId, claims)` — JIT provisioning: select by
  `clerk_user_id`; insert `{ clerkUserId, email, displayName }` if absent;
  return the local `users` row.
- **`/api/me`** — returns the local user + `profileSummary` from
  `user_profiles`. Anonymous → `{ user: null }`.
- **`/api/generate`, `/api/feedback`, `/api/me/history`** — logic unchanged;
  read `user` from the new middleware.
- **Delete** `routes/auth.ts` (signup/login/logout), `lib/auth.ts` (Lucia).
  `index.ts` swaps `sessionMiddleware` → `clerkAuthMiddleware`, drops the
  auth-route mount.
- **Deps:** remove `lucia`, `@lucia-auth/adapter-drizzle`, `bcryptjs`,
  `@types/bcryptjs`; add `@clerk/backend`.
- **Secret:** `CLERK_SECRET_KEY` on Fly.

## Frontend (apps/web)

- **Install** `@clerk/nextjs`.
- `app/layout.tsx`: wrap in `<ClerkProvider>` with an `appearance` config themed
  to Composed (colors + serif).
- **New** `middleware.ts`: `clerkMiddleware()`, matcher **excludes `/api/*`** and
  static assets.
- **New** `app/sign-in/[[...sign-in]]/page.tsx` → `<SignIn />`;
  `app/sign-up/[[...sign-up]]/page.tsx` → `<SignUp />`. Email + "Continue with
  Google" render automatically.
- **`ShowcaseHeader`**: replace custom nav with `<SignedOut>`
  (`<SignInButton>`/`<SignUpButton>`) and `<SignedIn>` (`<UserButton>`) + keep
  History link. Clerk components are reactive → the earlier stale-header bug
  disappears and the `window.location.assign` workaround is reverted.
- **`/account`**: rebuilt on `useUser()` for email/name; still fetches `/api/me`
  for the custom `profileSummary`; account management via `<UserButton>`.
- **Result page CTA**: "sign up to save" wraps in `<SignedOut>`, points at
  `<SignUpButton>`.
- **History page**: same logic (server when `useUser().isSignedIn`, else
  localStorage).
- **API token plumbing:** new `useApi()` hook wraps `apiPost`/`apiGet` and
  injects `Authorization: Bearer ${await getToken()}` from Clerk's `useAuth()`.
  Wizard, FeedbackForm, history switch to `useApi()`. Anonymous generate still
  works (no token → no header → backend anonymous).
- **Delete** `app/login/`, `app/signup/`, `components/auth/AuthForm.tsx`,
  `lib/use-auth.ts`.
- **Env (Vercel):** `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`,
  `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`,
  `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`, after-auth redirect → `/account`.

## Setup (user actions, detailed in the plan)

1. Create a Clerk application at clerk.com.
2. Enable Email + Google (Social Connections).
3. **Dev:** Clerk's shared Google dev credentials work on localhost with no
   Google Cloud setup.
4. **Production:** in Clerk → Google → custom credentials, paste a Google Cloud
   OAuth Client ID/Secret and register Clerk's callback URL in Google Cloud's
   authorized redirect URIs.
5. Enable "link accounts with same verified email."
6. Copy keys → set Vercel env + Fly `CLERK_SECRET_KEY` secret.

## Testing

- Delete `auth-routes.test.ts`, `me-route.test.ts` (Lucia/signup-based).
- Rewrite `generate-route.test.ts`, `history-route.test.ts` to use a helper that
  stubs the Clerk middleware with a fake verified user (no real Clerk calls).
- Add a unit test for `getOrCreateUser` (creates once; idempotent on repeat).
- Web: keep existing tests (storage-history, smoke); auth flow verified via
  browser smoke.

## Deletion list (cleanup)

- Backend: `routes/auth.ts`, `lib/auth.ts`, `middleware/session.ts`, `sessions`
  table, `password_hash` column; deps lucia, @lucia-auth/adapter-drizzle,
  bcryptjs, @types/bcryptjs; tests auth-routes, me-route (rewritten).
- Frontend: `app/login/`, `app/signup/`, `components/auth/AuthForm.tsx`,
  `lib/use-auth.ts`; revert `window.location.assign` header workaround.

## Out of scope (YAGNI)

- Clerk webhooks for user sync/deletion (JIT provisioning covers v1).
- Storing avatars or extended Google profile data.
- Enterprise SSO / SAML.
- Migrating existing users (none beyond throwaway test rows).

## Risks / notes

- **Vendor dependency:** Clerk now owns identity; this trades away some of the
  project's "own the whole stack / no lock-in" thesis. Accepted deliberately in
  favor of best-practice auth.
- **Testing friction:** integration tests must stub Clerk; no real-token tests
  in CI.
- **Two Clerk instances:** dev (localhost, shared Google creds) vs production
  (own Google creds, production keys). Keys differ per environment.
