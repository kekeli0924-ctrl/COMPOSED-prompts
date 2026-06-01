# Sidebar App-Shell + Dashboard — Design Spec (Phase 2)

**Date:** 2026-05-31
**Status:** Approved (brainstorming)
**Topic:** Add a Wispr-Flow-style sidebar app-shell + a "Welcome back" dashboard to the signed-in Composed experience. Phase 2 of the Editorial Calm work (Phase 1 restyle already shipped).

---

## Goal

Wrap the signed-in app surfaces (Dashboard, History, Study plan, Account) in a left **sidebar shell**, and turn the signed-in home into a **dashboard** (stat blocks + recent-prompts timeline) — the look from the approved "Option B" mockup, in the existing Editorial Calm tokens.

## Decided specifics (from brainstorming)

1. **Signed-in only.** The shell wraps the authed app. Signed-out visitors keep today's landing page; the wizard stays as-is for everyone.
2. **Home → dashboard** for signed-in users.
3. **Wizard stays full-bleed** (no sidebar) — the immersive multi-step flow + composing animation are untouched.
4. **Mobile** = top hamburger → slide-in drawer overlay.

## Architecture (Next.js App Router)

- A **route group `app/(app)/`** with a `layout.tsx` that renders the **Sidebar + main content area**. It wraps: `(app)/dashboard`, `(app)/history`, `(app)/account`, `(app)/plan`. Route groups don't change URLs — `/history`, `/account`, `/plan` keep their paths; the dashboard is `/dashboard`.
- **Move** the existing `app/history`, `app/account`, `app/plan` page dirs into `app/(app)/` (URLs unchanged). Update any internal imports/links if needed (the plan verifies no link breaks).
- **Landing + wizard stay outside the group** (full-bleed). `app/page.tsx` (landing) and `app/wizard/**` (incl. `wizard/result`) keep the existing top `ShowcaseHeader` and no sidebar.
- **Signed-in `/` → `/dashboard`.** `app/page.tsx` shows the landing for signed-out and redirects signed-in users to `/dashboard` (Clerk `auth()`/`<SignedIn>` + `redirect`). Avoid redirect loops (only `/` redirects; `/dashboard` never redirects back).
- **Header handling:** the global `<ShowcaseHeader />` currently lives in the root `app/layout.tsx`. Remove it from root; the `(app)` shell uses the sidebar instead, and the landing + wizard render `ShowcaseHeader` themselves (or via a shared public wrapper). Net: app pages = sidebar, public pages = header, no double chrome.

## Components

**`components/Sidebar.tsx`** (new, `'use client'`):
- Composed wordmark (serif) at top.
- A "Menu" section label (small uppercase muted).
- Nav items (line-icon + label), `next/link`: **Dashboard** (`/dashboard`), **History** (`/history`), **Study plan** (`/plan`), **Account** (`/account`). Active item (via `usePathname()`) gets `bg-accent text-foreground` + `aria-current="page"`.
- A sage **"+ New prompt"** `<Button asChild><Link href="/wizard">`.
- Bottom: signed-in user's name (Clerk `useUser()`) + a **Sign out** (`<SignOutButton>` / Clerk).
- **Icons:** small inline SVG line icons (home, clock, calendar, user) — **no new dependency**.
- **Mobile:** `useState` open/closed; a top bar with a hamburger toggles a fixed slide-in drawer + scrim. Hidden ≥`md`, where the sidebar is statically docked.

**`app/(app)/layout.tsx`** (new): flex shell — `<Sidebar />` + `<main>` content area on the cream canvas; handles the responsive docked-vs-drawer behavior.

**`app/(app)/dashboard/page.tsx`** (new):
- "Welcome back, {firstName}" (serif H1).
- **Three stat blocks** (Card: big serif number + small muted label): **Prompts made**, **Day streak**, **Next assessment**.
- A prominent **"+ New prompt"** CTA (also in the sidebar; one here as the primary dashboard action).
- **Recent prompts** timeline: the most recent ~5 generations as calm rows (course · mode · relative time), each linking to that prompt's view (reuse the history entry → prompt display).

## Data (one small additive backend change)

The dashboard reuses **`GET /api/me/history`** (already returns `entries` with `id, createdAt, courseId, mode, model, rating`). Stats computed **client-side**:
- **Prompts made** = `entries.length`.
- **Day streak** = consecutive calendar days (ending today/yesterday) that have ≥1 entry, from `createdAt`.
- **Next assessment** = soonest **future** `assessmentDate` across entries (else "—").

**Required additive change:** `assessmentDate` (and `assessmentType` for nicer labels) are **not** in the current `/api/me/history` select — they live in the stored, redacted `inputsJson`. Add them to the response (select `inputsJson` or extract the two fields server-side; they survive redaction, which only strips material/understanding/confusion). This is a **small additive, non-breaking** change to `apps/api/src/routes/me.ts` (the history handler) + its response type in `packages/shared`.
- **Fallback (if zero backend is preferred):** drop "Next assessment" and use **"Prompts this week"** (entries with `createdAt` in the last 7 days) — fully client-side, no endpoint change.

## Out of scope

- Signed-out experience (landing + wizard) — unchanged.
- The wizard flow + composing animation — unchanged.
- No DB schema change. No new npm dependencies (icons are inline SVG).
- No change to how prompts are generated/stored.

## Verification

- `apps/web` `npm run build` compiles; all routes still resolve at their existing URLs (no 404s from the route-group move); existing web `vitest` stays green; `apps/api` tests stay green (if the history handler changes, its test updates).
- `/browse` sweep: dashboard, history, account, plan inside the shell (desktop + mobile drawer); landing + wizard still full-bleed with the header; `/` redirects correctly when signed in.
- **A11y:** sidebar nav is keyboard-navigable; active link has `aria-current="page"`; the mobile drawer toggle has an accessible label and the scrim closes it.
- WCAG AA contrast holds (tokens already AA from Phase 1).

## Risks / notes

- **Route-group move** must preserve every URL and internal link — verify `/history`, `/account`, `/plan` still work and nothing imported a moved file by a path that changed.
- **Redirect:** signed-in `/` → `/dashboard` must not loop and must not flash the landing.
- **Header de-duplication:** ensure exactly one chrome per page (sidebar on app, header on public) — no page renders both or neither.
- The additive `/api/me/history` change is the only backend touch; keep it minimal and covered by the existing route test.
