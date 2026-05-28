# `apps/web` — Composed frontend

Next.js 14 (App Router) frontend for Composed. Hosted on Vercel. Calls the Hono backend (`apps/api`) for generation, auth, and history.

## What's here

- **Wizard** (`app/wizard/page.tsx`) — 6-step React state machine for collecting student inputs
- **Result** (`app/wizard/result/page.tsx`) — shows generated prompt + feedback form + sign-up CTA for anonymous users
- **History** (`app/history/page.tsx`) — server-backed list of past prompts (authed) or localStorage fallback (anonymous)
- **Auth** (`app/login`, `app/signup`, `app/account`) — Lucia-backed sessions, email + password
- **About** (`app/about/page.tsx`) — architecture deep-dive (showcase context)

## Tech

- Next.js 14 (App Router) + TypeScript strict
- React 18
- Tailwind + shadcn/ui (`@radix-ui/*`)
- Zod for runtime validation (shared schemas from `@composed-prompts/shared`)
- `useAuth` hook + `apiPost`/`apiGet` wrappers (in `lib/`)
- Vitest + Playwright

## Local setup

```bash
# from repo root
npm install
cd apps/web
cp .env.local.example .env.local
# set NEXT_PUBLIC_API_BASE_URL=http://localhost:8080 if running the API locally,
# or =https://composed-prompts-api.fly.dev to hit production.

npm run dev   # port 3100
```

Port 3100 is the project default — 3000 is reserved for another local site.

## Env vars

- `NEXT_PUBLIC_API_BASE_URL` — base URL of the Hono backend (e.g. `https://composed-prompts-api.fly.dev`). Required in production.

That's it for the frontend. All sensitive keys (Anthropic, DB) live on the backend.

## Tests

```bash
npm test            # vitest unit tests
npm run test:e2e    # Playwright wizard flow
```

## Build

```bash
npm run build
```

Should produce 9 static routes: `/`, `/about`, `/account`, `/history`, `/login`, `/signup`, `/wizard`, `/wizard/result`, `/_not-found`. No server routes (the legacy `/api/generate` and `/api/feedback` were deleted in B11; they live on Fly now).

## Deploy

Push to `main` → Vercel auto-builds. Set `NEXT_PUBLIC_API_BASE_URL` in Vercel's Production env vars.

## Notes for contributors

- The shared `@composed-prompts/shared` package is configured via `transpilePackages` in `next.config.mjs` plus a webpack `extensionAlias` so its NodeNext `.js` imports resolve to `.ts` source.
- Anonymous users still use `localStorage` (`lib/storage/history.ts`) for history; authed users read from the server via `GET /api/me/history`.
- The wizard's "Composing…" screen runs for at least 4.5s even when the backend response is faster, so the animation feels intentional.
