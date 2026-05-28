# Composed

A guided web wizard that generates LLM-and-model-tuned study prompts for Pomfret School students, with a feedback loop that gets smarter over time.

```
┌──────────────────────┐         ┌────────────────────────┐
│ apps/web             │ HTTPS   │ apps/api               │
│ Next.js 14 (Vercel)  │ ──────► │ Hono on Fly.io         │
│                      │ cookies │ Postgres (Neon)        │
│ wizard UI, history,  │ ◄────── │ Lucia sessions         │
│ auth pages           │         │ /api/generate ↔ Opus   │
└──────────────────────┘         │ RAG retrieval + profile│
                                 │ job (every 4h)         │
                                 └────────────────────────┘
                                            │
                                            ▼
                                 packages/shared
                                 types · Zod · templates ·
                                 Opus full-prompt · format
                                 selector · prompt-hash
```

Live: https://composed-prompts.vercel.app · API: https://composed-prompts-api.fly.dev/health

## Workspaces

- **`apps/web`** — Next.js 14 frontend on Vercel. Wizard UI, auth pages, history view. See [`apps/web/README.md`](apps/web/README.md).
- **`apps/api`** — Hono backend on Fly.io. Generation, persistence, auth, RAG, profile job. See [`apps/api/README.md`](apps/api/README.md).
- **`packages/shared`** — TypeScript types, Zod validation, prompt templates + assembler, Opus full-prompt module, format selector. Imported by both apps.

## Repo layout

```
apps/
  web/                  Next.js frontend (Vercel)
  api/                  Hono backend (Fly.io)
    src/
      index.ts          server entry
      lib/              db, auth, rag, pipeline, budget, rate-limit
      middleware/       cors, session
      routes/           health, generate, feedback, auth, me
      jobs/             update-profiles (scheduled)
      schema.ts         Drizzle Postgres schema
    tests/              vitest (integration + unit)
    drizzle/            migrations
    Dockerfile          main api image (tsx runtime)
    Dockerfile.job      profile-update job image
packages/
  shared/               shared TS types, validation, templates,
                        Opus full-prompt, format selector
docs/
  superpowers/plans/    detailed implementation plans
fly.toml                fly.io config (main API)
```

## Local development

```bash
# install all workspace deps
npm install

# run frontend (port 3100)
npm run dev --workspace=apps/web

# run backend (port 8080) — needs apps/api/.env with DATABASE_URL + ANTHROPIC_API_KEY
npm run dev --workspace=apps/api

# everything in parallel from two terminals, or run them separately as needed.
# the frontend talks to apps/api via NEXT_PUBLIC_API_BASE_URL (apps/web/.env.local).
```

Port 3100 is the project default — 3000 is reserved for an unrelated local site.

## Tests

```bash
npm test --workspaces --if-present
```

Coverage:
- `packages/shared` — 73 unit tests (templates, assembler, Opus module mocked, prompt-hash, redact)
- `apps/api` — 47 integration tests (DB-backed; need `DATABASE_URL` to a test schema)
- `apps/web` — 7 unit tests (history adapter, smoke)

Total: 127 tests.

## Architecture decisions

The detailed implementation plans are in [`docs/superpowers/plans/`](docs/superpowers/plans/). The two big ones:

- `2026-05-27-pomfret-prompt-generator.md` — original v1 (single Next.js app on Vercel with KV)
- `2026-05-27-backend-service.md` — v2 refactor: separate Hono backend on Fly with Postgres, Lucia auth, RAG retrieval, scheduled profile job. This is the current architecture.

Why the v2 split:
1. Vercel's 10s serverless timeout was risky for Opus 4.7 calls
2. KV-based feedback aggregation was the wrong primitive for RAG retrieval over history
3. Wanted portability away from Vercel's vendor lock-in
4. Auth + multi-device history needed a real database

## Deploy

- Frontend: `git push origin main` — Vercel auto-deploys `apps/web`
- Backend: `fly deploy -c fly.toml --dockerfile apps/api/Dockerfile`

Env vars are documented in each workspace's README.
