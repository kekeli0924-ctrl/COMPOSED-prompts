# Backend Service + Accounts + Learning System — Design Spec

**Date:** 2026-05-27
**Status:** Approved for planning
**Project:** Pomfret Prompt Generator (existing app at https://composed-prompts.vercel.app)

## 1. Problem

The current app runs as a Next.js monolith on Vercel — both frontend and API routes live in one project. Three pain points motivated this work:

1. **10-second timeout risk.** Vercel's free-tier serverless functions are killed at 10s. Opus 4.7 calls average ~10s, sitting right at the limit. Slow Opus responses trigger 504 errors today (mitigated only by the deterministic fallback).
2. **Vendor lock-in.** The architecture depends on Vercel-specific features (KV, serverless function model, edge runtime quirks). The codebase doesn't run cleanly anywhere else.
3. **Static behavior.** Every generation is independent. The system doesn't learn from accumulating user feedback — Opus produces the same quality on day 1 as day 365.

This spec defines a separate backend service that solves all three: portable, no timeout, and equipped with a learning pipeline that improves prompts over time as feedback accumulates.

## 2. Goals

- Move all backend logic (generation, feedback, rate limiting) off Vercel into a dedicated service
- Eliminate the 10s timeout failure mode (Fly.io has no execution time limit)
- Add user accounts (optional — anonymous use still works)
- Persist all generations + feedback in a real database
- Use accumulated feedback to make new prompts better, both globally (RAG across all users) and per-user (personal preference profiles)
- Keep the existing Next.js frontend on Vercel; this is purely a backend migration + expansion

## 3. Non-Goals (v1)

- Teacher dashboard / analytics across students
- Mobile app
- Email notifications or digests
- Multi-language support
- pgvector semantic similarity (exact `course_id + mode` match is sufficient for v1)
- A/B testing infrastructure
- Custom domain (initially on `composed-prompts-api.fly.dev`; custom domain when you own `composed-prompts.com`)
- Migration of existing anonymous localStorage history into Postgres on first auth — fresh start instead

## 4. Architecture Overview

```
┌─────────────────────────┐                ┌──────────────────────────┐
│ Next.js frontend        │                │ Hono backend service     │
│ on Vercel               │  HTTPS + cookie│ on Fly.io                │
│ (composed-prompts       │ ──────────────▶│ (composed-prompts-api    │
│   .vercel.app)          │ ◀──────────────│   .fly.dev)              │
└─────────────────────────┘                └────────┬─────────────────┘
                                                    │
                              ┌─────────────────────┼───────────────┐
                              │                     │               │
                              ▼                     ▼               ▼
                       ┌────────────┐       ┌─────────────┐   ┌─────────────┐
                       │ Neon       │       │ Anthropic   │   │ Fly.io      │
                       │ Postgres   │       │ API (Opus   │   │ scheduled   │
                       │ (free tier)│       │  4.7)       │   │ job (cron)  │
                       └────────────┘       └─────────────┘   └─────────────┘
```

## 5. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Framework | Hono | Modern, lightweight, ESM-first, runs on Node/Bun/Deno/Cloudflare. TypeScript-native. |
| Database | Neon Postgres (serverless) | Free tier, branching, built-in pgvector if we want it later. Postgres is universal. |
| ORM | Drizzle | TypeScript-native, generates SQL migrations, lightweight. |
| Auth | Lucia | Open-source session-based auth. No vendor. Sessions stored as DB rows + httpOnly cookies. |
| Hosting | Fly.io | Docker-based, free tier, global regions, no vendor-specific runtime. |
| Validation | Zod | Same as existing project. |
| Testing | Vitest + Playwright | Same as existing project. |
| Anthropic | `@anthropic-ai/sdk` with prompt caching | Same as existing project. |

## 6. Repository Layout

Monorepo style:

```
prompt/                          # existing repo
├── apps/
│   ├── web/                     # existing Next.js app, moved into apps/
│   └── api/                     # new Hono backend
│       ├── src/
│       │   ├── index.ts         # Hono app entry
│       │   ├── routes/
│       │   │   ├── auth.ts
│       │   │   ├── generate.ts
│       │   │   ├── feedback.ts
│       │   │   └── me.ts
│       │   ├── lib/
│       │   │   ├── db.ts        # Drizzle client
│       │   │   ├── auth.ts      # Lucia client
│       │   │   ├── anthropic.ts # Opus client
│       │   │   ├── rag.ts       # retrieval logic
│       │   │   ├── rate-limit.ts
│       │   │   └── pipeline.ts  # full generation pipeline
│       │   └── jobs/
│       │       └── update-profiles.ts  # scheduled task
│       ├── drizzle/             # generated migrations
│       ├── schema.ts            # Drizzle schema definitions
│       ├── Dockerfile
│       ├── fly.toml
│       └── package.json
├── packages/
│   └── shared/                  # shared types between web + api
│       └── src/
│           ├── wizard-inputs.ts # type + zod schema
│           └── api-contracts.ts # request/response types
└── package.json                 # workspace root
```

## 7. Database Schema

Initial schema (Drizzle definitions in `apps/api/schema.ts`):

```typescript
users
  id            uuid pk
  email         text unique not null
  display_name  text
  password_hash text not null            // bcrypt
  created_at    timestamptz default now()

sessions (Lucia-managed)
  id          text pk
  user_id     uuid fk users.id on delete cascade
  expires_at  timestamptz not null

generations
  id            uuid pk
  user_id       uuid fk users.id nullable     // null for anonymous
  ip_hash       text                          // SHA-256(ip) for anon rate limit
  inputs_json   jsonb not null                // WizardInputs minus material
  prompt_text   text not null                 // final assembled prompt (material redacted)
  prompt_hash   text not null                 // SHA-256(prompt_text) for dedup
  generator     text not null check ('opus','deterministic')
  course_id     text                          // indexed for RAG retrieval
  mode          text not null                 // indexed for RAG retrieval
  provider      text not null
  model         text not null
  fallback_reason text                        // null on success
  created_at    timestamptz default now() indexed

feedback
  id              uuid pk
  generation_id   uuid fk generations.id on delete cascade unique
  user_id         uuid fk users.id nullable
  rating          int check (1<=rating<=5)
  text            text                        // optional comment
  created_at      timestamptz default now()

user_profiles
  user_id     uuid pk fk users.id on delete cascade
  summary     text                            // one-paragraph preference summary
  updated_at  timestamptz default now()

rate_limit_log
  id          bigserial pk
  bucket_key  text not null                   // 'ip:<ip_hash>' or 'user:<user_id>'
  occurred_at timestamptz default now() indexed
  // Periodic prune job deletes rows older than 48h
```

Indexes:
- `generations(course_id, mode, created_at DESC)` — for collective RAG retrieval
- `generations(user_id, created_at DESC)` — for personal history + personal RAG
- `feedback(generation_id)` — already unique
- `sessions(user_id)`

Privacy enforced at write-time:
- `inputs_json` excludes the raw `material` field (replaced with `[redacted]`)
- `prompt_text` has its `<material>...</material>` section scrubbed before insert (reuses the existing `redactMaterialForHistory` function from `lib/storage/history.ts`)

## 8. API Surface

All routes under `/api`. Hono handles routing.

| Method | Path | Auth | Purpose |
|---|---|---|---|
| `POST` | `/api/auth/signup` | none | Email + password → creates user + session cookie |
| `POST` | `/api/auth/login` | none | Email + password → session cookie |
| `POST` | `/api/auth/logout` | session | Invalidates session, clears cookie |
| `GET` | `/api/me` | session | Returns `{ id, email, displayName, profileSummary }` |
| `POST` | `/api/generate` | optional | Runs the prompt pipeline. Returns `{ prompt, metadata }` |
| `POST` | `/api/feedback` | optional | Stores rating + text against a generation |
| `GET` | `/api/me/history` | session required | Paginated list of user's past generations |
| `GET` | `/api/me/history/:id` | session required | Single generation in full |
| `GET` | `/health` | none | Returns 200 OK (Fly health check) |

**Request/response contracts** live in `packages/shared/src/api-contracts.ts` and are imported by both apps for type safety.

**CORS:** Hono CORS middleware allows the Vercel frontend origin (`https://composed-prompts.vercel.app`, plus `http://localhost:3100` for local dev). `credentials: true` so session cookies flow.

**Cookies:** Session cookie is httpOnly, secure, sameSite=`lax`, set on the API domain. Frontend sends with `credentials: 'include'`.

**Rate limits:** Per-IP sliding window (20/IP/day for anon, 100/user/day for authed), backed by Postgres instead of Vercel KV. Uses a `rate_limit_log` table with a periodic prune job.

## 9. The Generation Pipeline (with RAG)

`POST /api/generate` flow:

```
1. Validate inputs (Zod, shared schema)
2. Identify user (session cookie if present; otherwise anonymous + IP hash)
3. Rate-limit check (Postgres)
4. Daily budget check (Postgres counter, ceiling configurable)
5. RAG retrieval (3 parallel Postgres queries):
   a. Top 2 collective examples: generations matching (course_id, mode) with rating ≥ 4,
      ordered by (rating * recency) score
   b. Top 1 personal example: same query but user_id = current_user (skip if anonymous)
   c. Personal profile summary: user_profiles.summary (skip if anonymous or none)
6. Build Opus user message: existing wizard inputs + Pomfret course data + RAG context block
7. Call Opus 4.7 (system prompt cached)
8. On success: persist generation row + return prompt + metadata
9. On Opus failure: deterministic fallback, persist with generator='deterministic',
   return prompt + metadata with fallbackReason
10. (Out of band) Add to rate limit counter; add to budget tracker
```

**Opus system prompt:** Identical to current except the user message includes an additional section:

```
---
Context from past generations that scored well:

Personal style notes:
{user_profiles.summary if present}

What worked for THIS student previously:
- {best personal example: Interaction Style + Output Spec sections}

What worked for OTHER students in this exact course + mode:
- {top collective example 1: Interaction Style + Output Spec sections}
- {top collective example 2: Interaction Style + Output Spec sections}

Adapt these — don't copy them. Match the spirit of what worked, not the literal wording.
```

If retrieval returns empty (cold start), the entire "Context from past generations" block is omitted. The prompt generates normally with no degradation.

**Performance budget:** RAG queries run in parallel and total <50ms with proper indexes. Opus call dominates at ~10s. Total request time: ~10–11s.

## 10. Personal Profile Computation (background job)

Runs every 4 hours via Fly.io scheduled machine. For each user with ≥5 rated generations in the past 30 days:

1. Pull last 30 generations + ratings + text feedback
2. Single Opus 4.7 call: "Summarize this student's study preferences in one paragraph based on their feedback patterns and the prompts they rated highly vs poorly."
3. Upsert into `user_profiles.summary`

Cost: ~$0.05 per profile update. At 50 active users every 4 hours = ~$15/month maximum. Linear with user growth.

Cold start: Until a user has 5 rated generations, they have no profile. Retrieval skips the personal profile block.

## 11. Frontend Changes (Vercel app)

1. **New env var** `NEXT_PUBLIC_API_BASE_URL`. All API calls go to `${API_BASE}/api/*` instead of `/api/*`. Empty env var falls back to relative URLs (current behavior, for safe rollout).
2. **`fetch` calls** add `credentials: 'include'` so session cookies flow cross-origin.
3. **New pages:** `/login`, `/signup`, `/account`.
4. **Header component:** Shows "Sign in" / "Sign up" when anonymous; "My account" / "History" / "Sign out" when authed.
5. **History page:** Reads from `GET /api/me/history` when authed; falls back to localStorage for anonymous.
6. **Result page tweak:** After generation, anonymous users see a soft "Sign up to save this and get smarter prompts over time" banner.
7. **Auth state hook:** A simple `useAuth()` hook that fetches `/api/me` once on mount, caches the result. Provides `user`, `loading`, `signOut()`.

## 12. Migration Plan

Low-risk, fully reversible.

1. **Monorepo restructure.** Move the existing Next.js project from the repo root into `apps/web/`. Add a root `package.json` with workspaces. Update Vercel's build settings (root directory → `apps/web`). Verify the production deploy is unaffected. This is mechanical and reversible.
2. **Build the backend in parallel.** New code in `apps/api/`. Existing Next.js app (now at `apps/web/`) untouched.
3. **Provision infra:** Neon project, Fly.io app, GitHub Actions for deploy.
4. **Deploy backend to Fly.io.** Smoke-test via curl. No frontend traffic yet.
5. **Wire frontend behind env var.** Add `NEXT_PUBLIC_API_BASE_URL` env var support; default empty (current behavior).
6. **Cutover:** Set the env var in Vercel → frontend redeploys → all traffic now hits the new backend. Old Vercel API routes still exist as fallback (not called).
7. **Verify in production** (a day of usage by you + friends).
8. **Cleanup:** Delete `apps/web/app/api/generate` and `apps/web/app/api/feedback`. Push.

Rollback: unset the env var in Vercel. Frontend reverts to the old API routes.

## 13. Deploy + Ops

- **Fly.io:** 1 shared-CPU 256MB machine in `iad` region. Auto-scale to 0 when idle (free tier). Background-job machine runs the profile updater every 4h.
- **Neon:** Free tier, US East. Database scales to 0 compute when idle. Branching used for dev/staging.
- **Secrets:** `ANTHROPIC_API_KEY`, `DATABASE_URL`, `SESSION_SECRET` all in Fly secrets.
- **Logs:** Fly's built-in log streaming. Consider Logtail integration later if needed.
- **Monitoring:** Fly health check on `/health`. Simple uptime ping (UptimeRobot free tier).
- **CI/CD:** GitHub Actions workflow: on push to main, `fly deploy` for `apps/api/`. Vercel handles `apps/web/` auto-deploy as today.

## 14. Cost Estimate

| Component | Tier | Monthly |
|---|---|---|
| Fly.io | Free tier | $0 |
| Neon | Free tier | $0 |
| Vercel | Hobby (existing) | $0 |
| Anthropic — generation (Opus 4.7) | ~$0.07 × 20/day | ~$42 |
| Anthropic — profile updates | ~$0.05 × 50 users × 6/day | ~$15 |
| **Total** | | **~$57/month** |

Identical to current for generation; ~$15 added for the profile job. Both tiers have generous overhead before any paid tier kicks in.

## 15. Testing Strategy

- **Unit (Vitest):** RAG query builders, profile-update job logic, auth helpers, validation schemas
- **Integration (Vitest + Docker Postgres):** Auth flow (signup→login→session→logout), generation pipeline end-to-end with mocked Anthropic, RAG retrieval correctness (seed known generations, verify they're returned), rate limiting
- **E2E (Playwright):** One critical path covering anonymous generate → signup → see history → rate → return → see profile influence (later runs)
- **Skip:** Snapshot testing of generated prompts (brittle as RAG context grows); use shape assertions

## 16. Privacy + Security

- Pasted `material` is never stored in `generations.inputs_json` (replaced with `[redacted]`)
- Pasted `material` is scrubbed from `prompt_text` before insert (existing redaction helper)
- Collective RAG examples are anonymized — only the prompt text is retrieved, never the original user_id
- `user_profiles.summary` is only ever returned to its own user (via `/api/me`)
- Passwords stored as bcrypt hashes
- Session cookies httpOnly, secure, sameSite=lax
- CORS allowlist is strict (no wildcards)
- `SESSION_SECRET` rotated annually
- Anthropic key only in Fly secrets, never in client code

## 17. Error Handling

| Failure | Behavior |
|---|---|
| Opus API failure / timeout | Falls back to deterministic; generation persisted with `generator='deterministic'`, `fallback_reason='api-error'`. Banner shown to user. |
| Postgres connection failure | Returns 503. No fallback — we can't generate without persistence anymore. Logged to Fly logs. |
| Rate limit exceeded | Returns 429 with retry-after header |
| Session expired | Returns 401; frontend redirects to login |
| Invalid input | Returns 400 with Zod errors |
| RAG query failure | Logged but request proceeds without RAG context (graceful degradation) |
| Profile-update job failure | Job re-runs in 4h; no user-visible impact |

## 18. Open Questions for Implementation

- **Magic-link auth vs passwords.** Current plan uses passwords (simpler to ship). Magic links via Lucia + Resend save password-management complexity but slow first-login UX. Decide during impl.
- **Migration of localStorage history.** Current plan: fresh start at cutover. Anonymous users keep their localStorage; authed users start with an empty server-side history. Alternative: prompt user to "import 12 past prompts from this browser" on first login. Defer.
- **Custom domain.** `api.composed-prompts.com` requires owning `composed-prompts.com`. Defer until/unless domain is purchased.
- **pgvector for semantic RAG.** Current plan uses exact `(course_id, mode)` match. Once we have ≥500 generations, semantic retrieval (embed prompts, find nearest neighbors) could meaningfully improve quality. Add in a follow-up spec.

## 19. Implementation Phases (suggested by writing-plans)

The spec is large but cohesive. The implementation plan should structure tasks in phases that produce shippable value at each step:

- **Phase A: Foundation** — Monorepo restructure, Hono scaffold, Neon connection, Drizzle schema + migrations, basic `/health`. Deployable but not useful yet.
- **Phase B: Generation move-over** — Port `/api/generate` and `/api/feedback` to the new backend with no RAG yet. Cutover from Vercel. Persistence in Postgres begins.
- **Phase C: Auth** — Lucia integration, signup/login/logout endpoints, frontend auth pages, session middleware. No data tied to users yet beyond linking on POST.
- **Phase D: Server-side history** — `GET /api/me/history` endpoints, frontend history page rewrite, sign-up CTA on result page.
- **Phase E: RAG retrieval** — Add the retrieval queries to `/api/generate`, inject into Opus user message. Cold-start safe.
- **Phase F: Personal profiles** — Background job, profile retrieval, profile injection into Opus context.

Each phase ends with a working, deployable app. The writing-plans skill will translate this into the specific task list.
