# `apps/api` — Composed backend

Hono on Fly.io. Postgres on Neon. Lucia for sessions. Anthropic SDK for Opus 4.7. Runs TypeScript directly via `tsx` (no build step).

## Endpoints

| Method | Path                        | Purpose                                              |
|--------|-----------------------------|------------------------------------------------------|
| GET    | `/health`                   | Liveness probe                                       |
| POST   | `/api/generate`             | Generate a study prompt (Opus 4.7 or fallback)       |
| POST   | `/api/feedback`             | Submit a rating + optional text for a generation     |
| POST   | `/api/auth/signup`          | Create account, return session cookie                |
| POST   | `/api/auth/login`           | Authenticate, return session cookie                  |
| POST   | `/api/auth/logout`          | Invalidate session                                   |
| GET    | `/api/me`                   | Current user + profile summary, or `{ user: null }`  |
| GET    | `/api/me/history?limit&offset` | Paginated server-side history (authed)            |
| GET    | `/api/me/history/:id`       | Single history entry (authed, scoped to owner)       |

Cookies are `composed-prompts-session` (HTTP-only, `SameSite=Lax`, host-only on the API domain). CORS sends `Access-Control-Allow-Credentials: true` and echoes the request origin so the Vercel frontend can present cookies.

## Tech

- [Hono](https://hono.dev) 4 + `@hono/node-server`
- [Drizzle ORM](https://orm.drizzle.team) + `postgres-js` against Neon
- [Lucia](https://lucia-auth.com) 3 + `@lucia-auth/adapter-drizzle`
- `bcryptjs` for password hashing
- `@anthropic-ai/sdk` 0.99 with prompt caching
- Zod 4 for runtime validation
- Vitest for tests
- `tsx` 4 — runs `.ts` directly in dev AND production (no `tsc` build step)

## Local setup

```bash
# from repo root
npm install
cd apps/api
cp .env.example .env       # if not already present
# Set DATABASE_URL (Neon Postgres connection string) and ANTHROPIC_API_KEY in .env

# apply migrations
npm run db:migrate

# run server
npm run dev   # port 8080, hot-reloads via tsx watch
```

## Env vars

| Var                                | Required          | Notes                                                  |
|------------------------------------|-------------------|--------------------------------------------------------|
| `DATABASE_URL`                     | yes               | Neon Postgres connection string                        |
| `ANTHROPIC_API_KEY`                | yes               | Opus 4.7 + profile-job summarizer                      |
| `CORS_ALLOWED_ORIGINS`             | recommended       | Comma-separated; defaults to localhost + Vercel domain |
| `RATE_LIMIT_PER_IP_PER_DAY`        | optional (20)     |                                                        |
| `DAILY_BUDGET_CEILING_USD`         | optional (10)     |                                                        |
| `PORT`                             | optional (8080)   |                                                        |

In production, set these via `fly secrets set ... -a composed-prompts-api`. Never commit secrets.

## Tests

```bash
npm test
```

47 tests across 13 files. Most are integration tests against a live Postgres — point `DATABASE_URL` at a throwaway database; `tests/setup.ts` truncates all tables before each test.

## Schema

`src/schema.ts` defines:
- `users` — id, email, password_hash, display_name, created_at
- `sessions` — Lucia session table (id, user_id, expires_at)
- `generations` — every prompt produced; ties to user_id when authed, ip_hash always
- `feedback` — rating (1–5) + optional text, one per generation
- `user_profiles` — periodic summary of a user's style (written by the profile job)
- `rate_limit_log` — sliding-window counter (per-IP)
- `daily_spend` — daily Anthropic spend cap

Migrations live under `drizzle/`. Generate new ones with `npm run db:generate` and apply with `npm run db:migrate`.

## RAG retrieval

`src/lib/rag.ts` exposes:
- `queryCollectiveExamples({ courseId, mode, limit })` — high-rated examples (rating ≥ 4) from any user for the same course + mode
- `queryPersonalExamples({ userId, courseId, mode, limit })` — same, but scoped to one user
- `queryPersonalProfile(userId)` — the rolling summary written by the profile job
- `fetchRagContext({ userId, courseId, mode })` — runs all three in parallel
- `buildRagContext(ctx)` — formats the result as a text block appended to the Opus user message

The block is appended to the user message (not the system message) so the prompt-cache key — the system prompt + structure — stays stable across requests.

## Profile job

`src/jobs/update-profiles.ts`. Finds users with ≥ 5 rated generations in the last 30 days, asks Opus 4.7 to summarize their preferences in 3–5 sentences, upserts into `user_profiles`. Exported `updateAllProfiles({ summarizeFn? })` for test injection.

Image: `Dockerfile.job`. Fly app: `composed-prompts-jobs`. Config: `apps/api/fly.job.toml`. Schedule via Fly machine cron or GitHub Actions cron (see plan F2).

## Deploy

```bash
# from repo root
fly deploy -c fly.toml --dockerfile apps/api/Dockerfile          # main API
fly deploy -c apps/api/fly.job.toml --dockerfile apps/api/Dockerfile.job --build-only  # job image
```

Set secrets once per app:

```bash
fly secrets set ANTHROPIC_API_KEY=sk-ant-... DATABASE_URL=postgres://... -a composed-prompts-api
fly secrets set ANTHROPIC_API_KEY=sk-ant-... DATABASE_URL=postgres://... -a composed-prompts-jobs
```

Logs:

```bash
fly logs -a composed-prompts-api
fly logs -a composed-prompts-jobs
```
