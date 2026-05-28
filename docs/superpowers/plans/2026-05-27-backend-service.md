# Backend Service + Accounts + RAG Learning System — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the Pomfret Prompt Generator backend off Vercel into a separate Hono service on Fly.io with Neon Postgres + Lucia auth. Add user accounts (optional), server-side history, and a RAG learning pipeline that improves prompts over time using both collective and per-user feedback.

**Architecture:** Monorepo with `apps/web` (existing Next.js frontend, stays on Vercel), `apps/api` (new Hono backend on Fly.io), and `packages/shared` (types, validation, courses data, templates, generation modules). Frontend calls backend over HTTPS with session cookies. Postgres holds users, sessions, generations, feedback, and computed user profiles. RAG retrieval injects past high-rated examples into Opus prompts at generation time.

**Tech Stack:** Hono + TypeScript + Drizzle ORM + Neon Postgres + Lucia auth + bcrypt + Vitest + Fly.io + Docker. Frontend stays Next.js 14 + Tailwind + shadcn on Vercel.

**Spec:** `docs/superpowers/specs/2026-05-27-backend-service-design.md`

**Phasing:** 6 phases. Each phase ends with a deployable, shippable state. Tasks within a phase build on each other.

---

## File Structure (Locked)

```
prompt/                                  # repo root
├── package.json                         # NEW: workspace root
├── apps/
│   ├── web/                             # MOVED: was repo root, now here
│   │   ├── app/                         # existing Next.js App Router
│   │   ├── components/                  # existing components + new auth pages
│   │   │   ├── auth/                    # NEW: LoginForm, SignupForm, AuthHeader
│   │   │   └── (existing)
│   │   ├── lib/
│   │   │   ├── api-client.ts            # NEW: fetch wrapper with API_BASE_URL + credentials
│   │   │   ├── use-auth.ts              # NEW: auth state hook
│   │   │   └── (existing)
│   │   ├── app/login/page.tsx           # NEW
│   │   ├── app/signup/page.tsx          # NEW
│   │   ├── app/account/page.tsx         # NEW
│   │   ├── data/                        # MOVED to packages/shared/data
│   │   ├── scripts/                     # MOVED to packages/shared/scripts
│   │   ├── tests/                       # existing
│   │   ├── package.json
│   │   ├── next.config.mjs
│   │   ├── tailwind.config.ts
│   │   ├── tsconfig.json                # extends root, adds path to @shared
│   │   └── (existing)
│   └── api/                             # NEW: Hono backend
│       ├── src/
│       │   ├── index.ts                 # Hono app entry
│       │   ├── lib/
│       │   │   ├── db.ts                # Drizzle client
│       │   │   ├── auth.ts              # Lucia client
│       │   │   ├── session.ts           # session cookie helpers
│       │   │   ├── pipeline.ts          # full generation pipeline
│       │   │   ├── rag.ts               # RAG retrieval
│       │   │   ├── rate-limit.ts        # Postgres sliding window
│       │   │   ├── budget.ts            # daily spend cap
│       │   │   └── ip-hash.ts           # SHA-256(ip) for anon rate limit
│       │   ├── routes/
│       │   │   ├── health.ts            # GET /health
│       │   │   ├── auth.ts              # POST /api/auth/{signup,login,logout}
│       │   │   ├── generate.ts          # POST /api/generate
│       │   │   ├── feedback.ts          # POST /api/feedback
│       │   │   └── me.ts                # GET /api/me, /api/me/history
│       │   ├── middleware/
│       │   │   ├── cors.ts
│       │   │   ├── session.ts           # parse cookie, attach user to ctx
│       │   │   └── error.ts             # global error handler
│       │   └── jobs/
│       │       └── update-profiles.ts   # background profile updater (separate entry)
│       ├── schema.ts                    # Drizzle schema definitions
│       ├── drizzle/                     # generated SQL migrations
│       ├── tests/
│       │   ├── unit/                    # rag, pipeline, rate-limit, budget, etc.
│       │   ├── integration/             # auth-routes, generate-route, etc.
│       │   └── setup.ts                 # Postgres test DB setup
│       ├── docker-compose.yml           # local Postgres for tests
│       ├── drizzle.config.ts
│       ├── vitest.config.ts
│       ├── Dockerfile                   # main API service
│       ├── Dockerfile.job               # scheduled job service (smaller image)
│       ├── fly.toml                     # main service config
│       ├── fly.job.toml                 # job service config
│       ├── tsconfig.json
│       ├── .env.example
│       └── package.json
└── packages/
    └── shared/                          # NEW: types + data + shared logic
        ├── package.json                 # name: @composed-prompts/shared
        ├── tsconfig.json
        ├── data/
        │   ├── courses.json             # moved from /data
        │   └── model-profiles.json      # moved from /data
        ├── scripts/
        │   ├── parse-curriculum.ts      # moved from /scripts
        │   └── build-courses.ts         # moved from /scripts
        └── src/
            ├── index.ts                 # barrel export
            ├── types.ts                 # StudyMode, AssessmentType, WizardInputs, etc.
            ├── api-contracts.ts         # NEW: API request/response types
            ├── validation/
            │   └── wizard-inputs.ts     # Zod schemas (moved from apps/web/lib/validation)
            ├── courses.ts               # loader (moved from apps/web/lib)
            ├── model-profiles.ts        # loader (moved from apps/web/lib)
            ├── templates/               # moved from apps/web/lib/templates
            │   ├── index.ts
            │   ├── shared.ts
            │   ├── cram-review.ts
            │   ├── multi-day-plan.ts
            │   ├── practice-questions.ts
            │   ├── concept-clarification.ts
            │   └── essay-project.ts
            ├── generation/              # moved from apps/web/lib/generation
            │   ├── assembler.ts
            │   ├── format-selector.ts
            │   └── opus-full-prompt.ts
            └── storage/
                ├── prompt-hash.ts       # moved from apps/web/lib/storage
                └── redact.ts            # extracted from history.ts
```

**Why this structure:**
- `packages/shared` because both `apps/web` (for typeahead, types, etc.) and `apps/api` (for generation pipeline) need the same templates + course data
- `apps/web` keeps everything Next.js-specific including the localStorage `history.ts` (frontend-only concern)
- `apps/api` has zero Next.js dependency — pure Hono service

---

## Phase A — Foundation

Goal: Monorepo structure in place, Hono API skeleton running with Neon, deployed to Fly.io with a working `/health` endpoint. Frontend untouched and continuing to serve all traffic via Vercel routes.

---

### Task A1: Restructure repo into monorepo (move root → `apps/web`)

**Files:**
- Move: every file at repo root (except `.git/`, `docs/`, `node_modules/`, `.next/`) into `apps/web/`
- Create: `package.json` (workspace root), `tsconfig.base.json` (shared TS config)

- [ ] **Step 1: Create `apps/web` directory and move files**

```bash
cd /Users/likerun/Desktop/prompt
mkdir -p apps/web
# Move everything except docs/, .git/, .next/, node_modules/, and our new apps/ dir
for item in $(ls -A | grep -vE '^(docs|\.git|\.next|node_modules|apps)$'); do
  git mv "$item" "apps/web/"
done
```

Note: use `git mv` (not `mv`) so git tracks the rename rather than recording a delete + add.

- [ ] **Step 2: Create root `package.json`**

Create `/Users/likerun/Desktop/prompt/package.json`:

```json
{
  "name": "composed-prompts",
  "private": true,
  "version": "0.1.0",
  "workspaces": [
    "apps/*",
    "packages/*"
  ],
  "scripts": {
    "web": "npm run dev --workspace=apps/web",
    "api": "npm run dev --workspace=apps/api",
    "test": "npm run test --workspaces --if-present"
  }
}
```

- [ ] **Step 3: Create `tsconfig.base.json`**

Create `/Users/likerun/Desktop/prompt/tsconfig.base.json`:

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "isolatedModules": true,
    "forceConsistentCasingInFileNames": true,
    "allowJs": false,
    "declaration": false,
    "sourceMap": true
  }
}
```

- [ ] **Step 4: Update `apps/web/tsconfig.json` to extend the base**

Modify `/Users/likerun/Desktop/prompt/apps/web/tsconfig.json` — at the top of `compilerOptions`, add:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    // keep existing options here, they override base where they overlap
  }
}
```

- [ ] **Step 5: Reinstall deps + verify build still works**

```bash
cd /Users/likerun/Desktop/prompt
rm -rf node_modules apps/web/node_modules
npm install
npm run test --workspace=apps/web
npm run build --workspace=apps/web
```

Expected: tests pass (99+1), build succeeds, all routes still generated.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "refactor: restructure repo as monorepo (move root → apps/web)"
```

---

### Task A2: Update Vercel project config for monorepo

This is a manual step the user performs in the Vercel dashboard. The plan documents it.

**Files:** none

- [ ] **Step 1: Update Vercel root directory**

The user goes to https://vercel.com/kekeli0924-ctrls-projects/composed-prompts/settings → General → Root Directory → set to `apps/web` → save.

- [ ] **Step 2: Trigger a redeploy via empty commit**

```bash
cd /Users/likerun/Desktop/prompt
git commit --allow-empty -m "chore: trigger Vercel redeploy with new monorepo root"
git push origin main
```

- [ ] **Step 3: Verify production still works**

Wait for Vercel deploy. Hit https://composed-prompts.vercel.app — landing page should still render with styling. Walk one wizard step to confirm. If broken, revert by setting Vercel Root Directory back to repo root and pushing a no-op commit.

---

### Task A3: Create `packages/shared` and move shared modules

**Files:**
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`, `packages/shared/src/index.ts`
- Move: many files from `apps/web/lib/*` and `apps/web/data/*` to `packages/shared/`

- [ ] **Step 1: Create package skeleton**

```bash
cd /Users/likerun/Desktop/prompt
mkdir -p packages/shared/src
mkdir -p packages/shared/data
mkdir -p packages/shared/scripts
```

Create `/Users/likerun/Desktop/prompt/packages/shared/package.json`:

```json
{
  "name": "@composed-prompts/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "main": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./data/courses.json": "./data/courses.json",
    "./data/model-profiles.json": "./data/model-profiles.json"
  },
  "dependencies": {
    "zod": "^4.4.3"
  }
}
```

Create `/Users/likerun/Desktop/prompt/packages/shared/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "composite": true
  },
  "include": ["src/**/*"]
}
```

- [ ] **Step 2: Move data files**

```bash
git mv apps/web/data/courses.json packages/shared/data/courses.json
git mv apps/web/data/model-profiles.json packages/shared/data/model-profiles.json
git mv apps/web/scripts/parse-curriculum.ts packages/shared/scripts/parse-curriculum.ts
git mv apps/web/scripts/build-courses.ts packages/shared/scripts/build-courses.ts
```

- [ ] **Step 3: Move type and validation modules**

```bash
git mv apps/web/lib/types.ts packages/shared/src/types.ts
mkdir -p packages/shared/src/validation
git mv apps/web/lib/validation/wizard-inputs.ts packages/shared/src/validation/wizard-inputs.ts
```

- [ ] **Step 4: Move generation + templates + storage modules**

```bash
git mv apps/web/lib/courses.ts packages/shared/src/courses.ts
git mv apps/web/lib/model-profiles.ts packages/shared/src/model-profiles.ts
git mv apps/web/lib/templates packages/shared/src/templates
git mv apps/web/lib/generation packages/shared/src/generation
mkdir -p packages/shared/src/storage
git mv apps/web/lib/storage/prompt-hash.ts packages/shared/src/storage/prompt-hash.ts
```

- [ ] **Step 5: Extract `redactMaterialForHistory` from `apps/web/lib/storage/history.ts` into `packages/shared/src/storage/redact.ts`**

Read `apps/web/lib/storage/history.ts` to find the existing `redactMaterialForHistory` function. Move it (including the `REDACTED` constant) to a new file:

Create `/Users/likerun/Desktop/prompt/packages/shared/src/storage/redact.ts`:

```typescript
const REDACTED = '[material redacted — not stored locally]';

export function redactMaterialForHistory(promptText: string): string {
  return promptText
    .replace(/<material>[\s\S]*?<\/material>/g, `<material>\n${REDACTED}\n</material>`)
    .replace(/(## MATERIAL\n\n)[\s\S]*?(?=\n\n## |\n\nStep \d|$)/g, `$1${REDACTED}`)
    .replace(/(Step \d+ — MATERIAL:\n)[\s\S]*?(?=\n\nStep \d|\n\n## |$)/g, `$1${REDACTED}`);
}
```

(If the actual implementation in `history.ts` differs, mirror it exactly. The function must produce byte-identical output to current.)

Then in `apps/web/lib/storage/history.ts`, replace the inline definition with an import:

```typescript
import { redactMaterialForHistory } from '@composed-prompts/shared/src/storage/redact';
```

Remove the inline `REDACTED` constant and the function body. Keep the rest of the file unchanged.

- [ ] **Step 6: Update courses references from `@/data/courses.json` → `@composed-prompts/shared/data/courses.json`**

In `packages/shared/src/courses.ts`, the import was previously `import coursesData from '@/data/courses.json';`. Change it to:

```typescript
import coursesData from '../data/courses.json' assert { type: 'json' };
```

(Relative path because we're now inside the shared package itself.)

Same for `packages/shared/src/model-profiles.ts` — `import profilesData from '../data/model-profiles.json' assert { type: 'json' };`

- [ ] **Step 7: Create the barrel export**

Create `/Users/likerun/Desktop/prompt/packages/shared/src/index.ts`:

```typescript
export * from './types';
export * from './api-contracts';
export * from './validation/wizard-inputs';
export * from './courses';
export * from './model-profiles';
export * from './storage/prompt-hash';
export * from './storage/redact';
export {
  templateFor,
  STUDY_MODE_LABELS,
  STUDY_MODE_DESCRIPTIONS,
} from './templates';
export {
  buildRoleSection,
  buildAboutMeSection,
  buildMaterialSection,
  buildGoalSection,
  buildSelfCheckSection,
} from './templates/shared';
export { assembleDeterministicPrompt, assembleSections } from './generation/assembler';
export { formatSection, formatAssembledPrompt } from './generation/format-selector';
export { generateFullPromptWithOpus, type OpusFullPromptResult } from './generation/opus-full-prompt';
```

- [ ] **Step 8: Create empty `api-contracts.ts` (filled in Phase B)**

Create `/Users/likerun/Desktop/prompt/packages/shared/src/api-contracts.ts`:

```typescript
// API request/response contracts shared between apps/web and apps/api.
// Populated in Phase B as endpoints are added.
export {};
```

- [ ] **Step 9: Add `@composed-prompts/shared` to `apps/web/package.json` deps**

Edit `/Users/likerun/Desktop/prompt/apps/web/package.json` — add to `"dependencies"`:

```json
"@composed-prompts/shared": "*"
```

- [ ] **Step 10: Update `apps/web` import paths**

In every TypeScript file under `apps/web/` that currently imports from `@/lib/types`, `@/lib/courses`, `@/lib/model-profiles`, `@/lib/validation/wizard-inputs`, `@/lib/storage/prompt-hash`, `@/lib/templates`, `@/lib/generation/*`, etc. — update the import to use `@composed-prompts/shared`.

For example, `apps/web/components/CoursePicker.tsx`:

Before:
```typescript
import { searchCourses, findCourse } from '@/lib/courses';
```

After:
```typescript
import { searchCourses, findCourse } from '@composed-prompts/shared';
```

Use grep to find all imports needing updates:

```bash
cd /Users/likerun/Desktop/prompt/apps/web
grep -rln "@/lib/\(types\|courses\|model-profiles\|validation\|storage/prompt-hash\|templates\|generation\)" --include="*.ts" --include="*.tsx"
```

For each file returned, update its imports.

Note: keep `@/lib/storage/history` as a local Next.js-only import (it uses `window.localStorage`).

- [ ] **Step 11: Update `tsconfig.json` paths**

In `/Users/likerun/Desktop/prompt/apps/web/tsconfig.json`, the existing `paths` block may have `"@/*": ["./*"]`. Keep it. The `@composed-prompts/shared` resolution comes from npm workspaces, not tsconfig paths.

- [ ] **Step 12: Install + verify**

```bash
cd /Users/likerun/Desktop/prompt
rm -rf node_modules apps/web/node_modules packages/shared/node_modules
npm install
npm run test --workspace=apps/web
npm run build --workspace=apps/web
```

Expected: 99 tests pass, build succeeds. If TypeScript can't resolve `@composed-prompts/shared`, ensure the workspace symlink was created in `node_modules/@composed-prompts/shared` (npm install does this automatically when workspaces are configured).

- [ ] **Step 13: Commit**

```bash
git add -A
git commit -m "refactor: extract shared modules into packages/shared"
```

---

### Task A4: Scaffold `apps/api` (Hono + TypeScript)

**Files:**
- Create: `apps/api/package.json`, `apps/api/tsconfig.json`, `apps/api/src/index.ts`, `apps/api/vitest.config.ts`, `apps/api/.env.example`, `apps/api/.gitignore`

- [ ] **Step 1: Create directory + package.json**

```bash
cd /Users/likerun/Desktop/prompt
mkdir -p apps/api/src/{routes,lib,middleware,jobs}
mkdir -p apps/api/tests/{unit,integration}
```

Create `/Users/likerun/Desktop/prompt/apps/api/package.json`:

```json
{
  "name": "@composed-prompts/api",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "tsx watch src/index.ts",
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run",
    "test:watch": "vitest",
    "db:generate": "drizzle-kit generate",
    "db:migrate": "drizzle-kit migrate",
    "db:studio": "drizzle-kit studio"
  },
  "dependencies": {
    "@composed-prompts/shared": "*",
    "@anthropic-ai/sdk": "^0.99.0",
    "@hono/node-server": "^1.13.7",
    "drizzle-orm": "^0.36.0",
    "hono": "^4.6.0",
    "lucia": "^3.2.0",
    "@lucia-auth/adapter-drizzle": "^1.1.0",
    "bcryptjs": "^2.4.3",
    "postgres": "^3.4.5",
    "zod": "^4.4.3"
  },
  "devDependencies": {
    "@types/bcryptjs": "^2.4.6",
    "@types/node": "^20.19.41",
    "drizzle-kit": "^0.28.0",
    "tsx": "^4.22.3",
    "typescript": "^5",
    "vitest": "^4.1.7"
  }
}
```

- [ ] **Step 2: Create tsconfig**

Create `/Users/likerun/Desktop/prompt/apps/api/tsconfig.json`:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "types": ["node"]
  },
  "include": ["src/**/*", "schema.ts"]
}
```

- [ ] **Step 3: Create `.env.example` + `.gitignore`**

Create `/Users/likerun/Desktop/prompt/apps/api/.env.example`:

```
# Anthropic
ANTHROPIC_API_KEY=sk-ant-...

# Neon Postgres (get from https://console.neon.tech)
DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require

# Lucia session secret (any 32+ char random string)
SESSION_SECRET=

# CORS allowed origins (comma-separated)
ALLOWED_ORIGINS=https://composed-prompts.vercel.app,http://localhost:3100

# Operational knobs
RATE_LIMIT_PER_IP_PER_DAY=20
RATE_LIMIT_PER_USER_PER_DAY=100
DAILY_BUDGET_CEILING_USD=10.00
```

Create `/Users/likerun/Desktop/prompt/apps/api/.gitignore`:

```
node_modules/
dist/
.env
.env.local
drizzle/meta/
```

- [ ] **Step 4: Create minimal Hono app**

Create `/Users/likerun/Desktop/prompt/apps/api/src/index.ts`:

```typescript
import { Hono } from 'hono';
import { serve } from '@hono/node-server';

const app = new Hono();

app.get('/', (c) => c.text('Pomfret Prompt Generator API'));

const port = parseInt(process.env.PORT ?? '8080', 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});

export default app;
```

- [ ] **Step 5: Create vitest config**

Create `/Users/likerun/Desktop/prompt/apps/api/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    environment: 'node',
    globals: true,
    include: ['tests/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});
```

- [ ] **Step 6: Install + smoke run**

```bash
cd /Users/likerun/Desktop/prompt
npm install
cd apps/api
npm run dev
```

Expected: prints "API listening on http://localhost:8080". Visit it — should see "Pomfret Prompt Generator API" text. Kill with Ctrl-C.

- [ ] **Step 7: Commit**

```bash
cd /Users/likerun/Desktop/prompt
git add -A
git commit -m "feat(api): scaffold Hono + TypeScript backend service"
```

---

### Task A5: Add `/health` endpoint (TDD)

**Files:**
- Create: `apps/api/src/routes/health.ts`, `apps/api/tests/unit/health.test.ts`
- Modify: `apps/api/src/index.ts`

- [ ] **Step 1: Write failing test**

Create `/Users/likerun/Desktop/prompt/apps/api/tests/unit/health.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { health } from '@/routes/health';

describe('GET /health', () => {
  it('returns 200 with ok body', async () => {
    const app = new Hono();
    app.route('/', health);
    const res = await app.request('/health');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual({ ok: true });
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
cd /Users/likerun/Desktop/prompt/apps/api
npm test tests/unit/health.test.ts
```

Expected: FAIL — `@/routes/health` not found.

- [ ] **Step 3: Implement**

Create `/Users/likerun/Desktop/prompt/apps/api/src/routes/health.ts`:

```typescript
import { Hono } from 'hono';

export const health = new Hono();

health.get('/health', (c) => c.json({ ok: true }));
```

- [ ] **Step 4: Wire into main app**

Edit `/Users/likerun/Desktop/prompt/apps/api/src/index.ts` to import and mount:

```typescript
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { health } from './routes/health';

const app = new Hono();

app.route('/', health);
app.get('/', (c) => c.text('Pomfret Prompt Generator API'));

const port = parseInt(process.env.PORT ?? '8080', 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});

export default app;
```

- [ ] **Step 5: Run, verify pass**

```bash
npm test tests/unit/health.test.ts
```

Expected: 1 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/health.ts apps/api/src/index.ts apps/api/tests/unit/health.test.ts
git commit -m "feat(api): GET /health endpoint"
```

---

### Task A6: Provision Neon Postgres (manual user step)

This is a manual step. The plan documents what to do and how to verify.

**Files:** none (config-only via Neon UI)

- [ ] **Step 1: Sign up + create project**

User goes to https://console.neon.tech/signup, signs up (free tier), clicks "New Project" → name "composed-prompts" → region: US East → click Create.

- [ ] **Step 2: Get connection string**

In the Neon dashboard, copy the "Pooled connection" string. Looks like:
`postgresql://user:password@ep-xxx.us-east-2.aws.neon.tech/composed-prompts?sslmode=require`

- [ ] **Step 3: Save to local `.env`**

Create `/Users/likerun/Desktop/prompt/apps/api/.env`:

```
ANTHROPIC_API_KEY=sk-ant-...your-real-key...
DATABASE_URL=postgresql://...the-neon-connection-string...
SESSION_SECRET=...generate-a-32-char-random-string-here...
ALLOWED_ORIGINS=https://composed-prompts.vercel.app,http://localhost:3100
RATE_LIMIT_PER_IP_PER_DAY=20
RATE_LIMIT_PER_USER_PER_DAY=100
DAILY_BUDGET_CEILING_USD=10.00
```

For SESSION_SECRET, generate via: `openssl rand -hex 32` and paste the result.

- [ ] **Step 4: Verify connectivity**

```bash
cd /Users/likerun/Desktop/prompt/apps/api
npm install -g psql 2>/dev/null || true   # if psql not installed
psql "$(grep DATABASE_URL .env | cut -d= -f2-)" -c "SELECT version();"
```

Expected: prints Postgres version. If psql isn't installed, skip — the next tasks will exercise the connection via the app code.

- [ ] **Step 5: Commit `.env.example` only**

`.env` is gitignored. Confirm:

```bash
cd /Users/likerun/Desktop/prompt
git status apps/api/.env
```

Expected: not listed in changes. If listed, ensure `.gitignore` excludes `.env` and `.env.local` and `.env.*`.

---

### Task A7: Drizzle schema (full v1 schema) + initial migration

**Files:**
- Create: `apps/api/schema.ts`, `apps/api/drizzle.config.ts`, `apps/api/src/lib/db.ts`

- [ ] **Step 1: Create Drizzle schema**

Create `/Users/likerun/Desktop/prompt/apps/api/schema.ts`:

```typescript
import { pgTable, uuid, text, timestamp, integer, jsonb, bigserial, primaryKey, check, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => ({
  userIdx: index('sessions_user_idx').on(t.userId),
}));

export const generations = pgTable('generations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  ipHash: text('ip_hash'),
  inputsJson: jsonb('inputs_json').notNull(),
  promptText: text('prompt_text').notNull(),
  promptHash: text('prompt_hash').notNull(),
  generator: text('generator', { enum: ['opus', 'deterministic'] }).notNull(),
  courseId: text('course_id'),
  mode: text('mode').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  fallbackReason: text('fallback_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  courseModeRecencyIdx: index('generations_course_mode_recency_idx').on(t.courseId, t.mode, t.createdAt),
  userRecencyIdx: index('generations_user_recency_idx').on(t.userId, t.createdAt),
}));

export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  generationId: uuid('generation_id').notNull().references(() => generations.id, { onDelete: 'cascade' }).unique(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  rating: integer('rating').notNull(),
  text: text('text'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ratingCheck: check('feedback_rating_check', sql`${t.rating} >= 1 AND ${t.rating} <= 5`),
}));

export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rateLimitLog = pgTable('rate_limit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  bucketKey: text('bucket_key').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  bucketTimeIdx: index('rate_limit_bucket_time_idx').on(t.bucketKey, t.occurredAt),
}));
```

- [ ] **Step 2: Create Drizzle config**

Create `/Users/likerun/Desktop/prompt/apps/api/drizzle.config.ts`:

```typescript
import { defineConfig } from 'drizzle-kit';
import 'dotenv/config';

export default defineConfig({
  schema: './schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
```

Add `dotenv` to dependencies:

```bash
cd /Users/likerun/Desktop/prompt/apps/api
npm install dotenv
```

- [ ] **Step 3: Create db client**

Create `/Users/likerun/Desktop/prompt/apps/api/src/lib/db.ts`:

```typescript
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from '../../schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is required');
}

const queryClient = postgres(connectionString, {
  prepare: false,  // required for Neon's pooled connection
  max: 5,
});

export const db = drizzle(queryClient, { schema });
export { schema };
```

- [ ] **Step 4: Generate initial migration**

```bash
cd /Users/likerun/Desktop/prompt/apps/api
npm run db:generate
```

Expected: creates `drizzle/0000_*.sql` with CREATE TABLE statements for all 6 tables.

- [ ] **Step 5: Apply migration to Neon**

```bash
npm run db:migrate
```

Expected: prints something like "✓ Migrations applied" and the tables now exist in Neon. Verify in the Neon dashboard → Tables → should see users, sessions, generations, feedback, user_profiles, rate_limit_log.

- [ ] **Step 6: Verify db connection from API**

Write a quick smoke test. Create `/Users/likerun/Desktop/prompt/apps/api/tests/integration/db.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import 'dotenv/config';
import { db } from '@/lib/db';
import { sql } from 'drizzle-orm';

describe('db connection', () => {
  it('connects to Postgres and returns version', async () => {
    const result = await db.execute(sql`SELECT version()`);
    expect(result.length).toBeGreaterThan(0);
    const versionStr = JSON.stringify(result[0]);
    expect(versionStr.toLowerCase()).toContain('postgres');
  });
});
```

Run it:

```bash
npm test tests/integration/db.test.ts
```

Expected: 1 passing. If it fails with "connection refused" or similar, the DATABASE_URL is wrong or the Neon database is paused (Neon pauses idle dbs; first query wakes it up — may take a few seconds).

- [ ] **Step 7: Commit**

```bash
cd /Users/likerun/Desktop/prompt
git add apps/api/schema.ts apps/api/drizzle.config.ts apps/api/drizzle apps/api/src/lib/db.ts apps/api/tests/integration/db.test.ts apps/api/package.json apps/api/package-lock.json
git commit -m "feat(api): Drizzle schema + Postgres client + initial migration"
```

---

### Task A8: Dockerfile + Fly.io config

**Files:**
- Create: `apps/api/Dockerfile`, `apps/api/fly.toml`, `apps/api/.dockerignore`

- [ ] **Step 1: Create Dockerfile**

Create `/Users/likerun/Desktop/prompt/apps/api/Dockerfile`:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder

WORKDIR /app

# Copy workspace root files
COPY package.json package-lock.json tsconfig.base.json ./

# Copy package manifests
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

# Install ALL deps (including dev) for the build step
RUN npm install --workspaces --include-workspace-root --no-audit --no-fund

# Copy source
COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

# Build the api workspace
RUN npm run build --workspace=apps/api

# Production stage
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/package-lock.json /app/tsconfig.base.json ./
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist
COPY --from=builder /app/apps/api/schema.ts ./apps/api/
COPY --from=builder /app/apps/api/drizzle ./apps/api/drizzle

# Production-only deps
RUN npm install --workspaces --include-workspace-root --omit=dev --no-audit --no-fund

EXPOSE 8080

CMD ["node", "apps/api/dist/index.js"]
```

- [ ] **Step 2: Create `.dockerignore`**

Create `/Users/likerun/Desktop/prompt/apps/api/.dockerignore`:

```
node_modules
dist
.env
.env.local
.next
```

(Note: actually create this at the REPO ROOT instead so it applies to the whole build context. Put `/Users/likerun/Desktop/prompt/.dockerignore`:)

```
node_modules
**/node_modules
apps/web/.next
apps/web/dist
apps/api/dist
apps/*/node_modules
packages/*/node_modules
.env
.env.local
**/.env
**/.env.local
.git
docs
*.log
```

- [ ] **Step 3: Create fly.toml**

Create `/Users/likerun/Desktop/prompt/apps/api/fly.toml`:

```toml
app = "composed-prompts-api"
primary_region = "iad"

[build]
  dockerfile = "apps/api/Dockerfile"

[http_service]
  internal_port = 8080
  force_https = true
  auto_stop_machines = "suspend"
  auto_start_machines = true
  min_machines_running = 0
  processes = ["app"]

[[http_service.checks]]
  interval = "30s"
  timeout = "5s"
  grace_period = "10s"
  method = "GET"
  path = "/health"

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"
  cpu_kind = "shared"
  cpus = 1

[env]
  PORT = "8080"
  NODE_ENV = "production"
```

- [ ] **Step 4: Add a TypeScript build target**

Modify `/Users/likerun/Desktop/prompt/apps/api/tsconfig.json` — confirm `compilerOptions.outDir` is `./dist`. Add a `noEmit: false` if it's not already:

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "./dist",
    "rootDir": "./src",
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "noEmit": false,
    "types": ["node"]
  },
  "include": ["src/**/*"]
}
```

(Removed `schema.ts` from include — it lives one dir up, doesn't compile via this tsconfig. The runtime can `require()` the compiled JS via the schema's import in `db.ts`.)

Wait — `schema.ts` does need to be compiled and present at runtime. Adjust: move `schema.ts` INTO `src/`:

```bash
cd /Users/likerun/Desktop/prompt/apps/api
git mv schema.ts src/schema.ts
```

Then update `src/lib/db.ts` import: `import * as schema from '../schema';`
And update `drizzle.config.ts`: `schema: './src/schema.ts',`

Re-run `npm run db:generate` to confirm Drizzle still finds the schema — should produce no new migrations (schema didn't change, just moved). Files in `drizzle/` are unchanged.

- [ ] **Step 5: Local Docker build test**

```bash
cd /Users/likerun/Desktop/prompt
docker build -f apps/api/Dockerfile -t composed-prompts-api .
```

Expected: builds successfully. If Docker not installed locally, skip this step — Fly will build on its side.

- [ ] **Step 6: Commit**

```bash
git add apps/api/Dockerfile apps/api/fly.toml apps/api/.dockerignore .dockerignore apps/api/src/schema.ts apps/api/tsconfig.json apps/api/drizzle.config.ts apps/api/src/lib/db.ts
git rm apps/api/schema.ts
git commit -m "feat(api): Dockerfile + Fly.io config + move schema into src/"
```

---

### Task A9: Deploy to Fly.io + set secrets

Manual user steps. The plan documents what to do.

**Files:** none

- [ ] **Step 1: Install flyctl (if needed)**

```bash
brew install flyctl   # macOS via Homebrew
# or
curl -L https://fly.io/install.sh | sh
```

- [ ] **Step 2: Sign up / log in**

```bash
fly auth signup   # if no account
# or
fly auth login
```

- [ ] **Step 3: Launch the app**

```bash
cd /Users/likerun/Desktop/prompt
fly launch --copy-config --no-deploy --name composed-prompts-api --region iad
```

Expected: detects the existing fly.toml in `apps/api/` (or asks where it is), creates the app named "composed-prompts-api" without deploying.

If `fly launch` doesn't find the config, run it from within `apps/api/`:

```bash
cd apps/api
fly launch --copy-config --no-deploy --name composed-prompts-api --region iad
```

- [ ] **Step 4: Set secrets**

```bash
cd /Users/likerun/Desktop/prompt
# Read from .env, set on Fly
fly secrets set ANTHROPIC_API_KEY="$(grep ^ANTHROPIC_API_KEY apps/api/.env | cut -d= -f2-)" \
                 DATABASE_URL="$(grep ^DATABASE_URL apps/api/.env | cut -d= -f2-)" \
                 SESSION_SECRET="$(grep ^SESSION_SECRET apps/api/.env | cut -d= -f2-)" \
                 ALLOWED_ORIGINS="https://composed-prompts.vercel.app" \
                 RATE_LIMIT_PER_IP_PER_DAY="20" \
                 RATE_LIMIT_PER_USER_PER_DAY="100" \
                 DAILY_BUDGET_CEILING_USD="10.00" \
                 -a composed-prompts-api
```

Expected: prints "Secrets are staged for the first deployment."

- [ ] **Step 5: Deploy**

```bash
cd /Users/likerun/Desktop/prompt
fly deploy -c apps/api/fly.toml --dockerfile apps/api/Dockerfile
```

Expected: builds image, pushes, deploys. Prints the URL (`https://composed-prompts-api.fly.dev`).

- [ ] **Step 6: Verify**

```bash
curl https://composed-prompts-api.fly.dev/health
```

Expected: `{"ok":true}`.

If 404 or no response, check `fly logs -a composed-prompts-api` for errors.

- [ ] **Step 7: Commit any updated fly.toml**

If `fly launch` updated `fly.toml`:

```bash
cd /Users/likerun/Desktop/prompt
git add apps/api/fly.toml
git commit -m "feat(api): Fly.io app provisioned + deployed; /health live"
git push origin main
```

**Phase A done.** The backend exists at `https://composed-prompts-api.fly.dev` with a working `/health` endpoint. Frontend is untouched.

---

## Phase B — Generation Move-Over

Goal: Port `/api/generate` and `/api/feedback` from the Next.js app to the new Hono service. Cutover the frontend. Delete the old Vercel API routes. After this phase: backend handles all generation, Postgres persists every generation, no RAG yet.

---

### Task B1: Postgres-backed rate limit (TDD)

**Files:**
- Create: `apps/api/src/lib/rate-limit.ts`, `apps/api/tests/unit/rate-limit.test.ts`, `apps/api/tests/setup.ts`

- [ ] **Step 1: Test setup helper for clearing DB between tests**

Create `/Users/likerun/Desktop/prompt/apps/api/tests/setup.ts`:

```typescript
import 'dotenv/config';
import { db, schema } from '@/lib/db';

export async function resetRateLimitLog(): Promise<void> {
  await db.delete(schema.rateLimitLog);
}

export async function resetAllTables(): Promise<void> {
  // Order matters for FK cascades
  await db.delete(schema.feedback);
  await db.delete(schema.generations);
  await db.delete(schema.sessions);
  await db.delete(schema.userProfiles);
  await db.delete(schema.users);
  await db.delete(schema.rateLimitLog);
}
```

- [ ] **Step 2: Write failing test**

Create `/Users/likerun/Desktop/prompt/apps/api/tests/unit/rate-limit.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { checkAndRecord } from '@/lib/rate-limit';
import { resetRateLimitLog } from '../setup';

describe('rate limit', () => {
  beforeEach(async () => {
    await resetRateLimitLog();
  });

  it('allows first request', async () => {
    const r = await checkAndRecord('ip:test-1', { limit: 5, windowSeconds: 60 });
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4);
  });

  it('blocks after limit', async () => {
    for (let i = 0; i < 5; i++) {
      await checkAndRecord('ip:test-2', { limit: 5, windowSeconds: 60 });
    }
    const r = await checkAndRecord('ip:test-2', { limit: 5, windowSeconds: 60 });
    expect(r.allowed).toBe(false);
    expect(r.remaining).toBe(0);
  });

  it('counts only requests within window', async () => {
    // Insert an old row directly to simulate "outside window"
    const { db, schema } = await import('@/lib/db');
    const old = new Date(Date.now() - 120 * 1000); // 2 min ago
    await db.insert(schema.rateLimitLog).values({ bucketKey: 'ip:test-3', occurredAt: old });
    const r = await checkAndRecord('ip:test-3', { limit: 5, windowSeconds: 60 });
    expect(r.allowed).toBe(true);
    expect(r.remaining).toBe(4); // old row excluded
  });
});
```

- [ ] **Step 3: Run, verify fail**

```bash
cd /Users/likerun/Desktop/prompt/apps/api
npm test tests/unit/rate-limit.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `/Users/likerun/Desktop/prompt/apps/api/src/lib/rate-limit.ts`:

```typescript
import { db, schema } from './db';
import { and, eq, gte, sql } from 'drizzle-orm';

export type RateLimitOptions = {
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
};

export async function checkAndRecord(
  bucketKey: string,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  try {
    const windowStart = new Date(Date.now() - opts.windowSeconds * 1000);

    // Count entries within the window
    const [countRow] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(schema.rateLimitLog)
      .where(
        and(
          eq(schema.rateLimitLog.bucketKey, bucketKey),
          gte(schema.rateLimitLog.occurredAt, windowStart),
        ),
      );
    const count = countRow?.count ?? 0;

    if (count >= opts.limit) {
      return { allowed: false, remaining: 0 };
    }

    // Record this request
    await db.insert(schema.rateLimitLog).values({ bucketKey });

    return { allowed: true, remaining: opts.limit - count - 1 };
  } catch (err) {
    console.error('[rate-limit] failure, failing open', {
      message: err instanceof Error ? err.message : String(err),
    });
    return { allowed: true, remaining: opts.limit };
  }
}

// Periodic prune helper (called by a job later, or on app startup)
export async function pruneOldRateLimitEntries(olderThanSeconds: number): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanSeconds * 1000);
  const result = await db
    .delete(schema.rateLimitLog)
    .where(sql`${schema.rateLimitLog.occurredAt} < ${cutoff}`)
    .returning({ id: schema.rateLimitLog.id });
  return result.length;
}
```

- [ ] **Step 5: Run, all pass**

```bash
npm test tests/unit/rate-limit.test.ts
```

Expected: 3 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/rate-limit.ts apps/api/tests/unit/rate-limit.test.ts apps/api/tests/setup.ts
git commit -m "feat(api): Postgres-backed sliding-window rate limit"
```

---

### Task B2: Daily budget cap (TDD)

**Files:**
- Create: `apps/api/src/lib/budget.ts`, `apps/api/tests/unit/budget.test.ts`
- Modify: `apps/api/src/schema.ts` — add `daily_spend` table

- [ ] **Step 1: Add daily_spend table to schema**

Edit `/Users/likerun/Desktop/prompt/apps/api/src/schema.ts` — add at the bottom:

```typescript
import { numeric } from 'drizzle-orm/pg-core';

export const dailySpend = pgTable('daily_spend', {
  day: text('day').primaryKey(),  // ISO date YYYY-MM-DD UTC
  cumulativeUsd: numeric('cumulative_usd', { precision: 10, scale: 4 }).notNull().default('0'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});
```

Also add `numeric` to the existing import from `drizzle-orm/pg-core` at the top.

- [ ] **Step 2: Generate + apply migration**

```bash
cd /Users/likerun/Desktop/prompt/apps/api
npm run db:generate
npm run db:migrate
```

Expected: creates a new migration adding the `daily_spend` table. Verifies in Neon.

- [ ] **Step 3: Write failing test**

Create `/Users/likerun/Desktop/prompt/apps/api/tests/unit/budget.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { budgetAvailable, recordSpend, resetForTests } from '@/lib/budget';

describe('daily budget cap', () => {
  beforeEach(async () => {
    process.env.DAILY_BUDGET_CEILING_USD = '0.10';
    await resetForTests();
  });

  it('allows spend when under ceiling', async () => {
    expect(await budgetAvailable()).toBe(true);
    await recordSpend(0.05);
    expect(await budgetAvailable()).toBe(true);
  });

  it('blocks once ceiling exceeded', async () => {
    await recordSpend(0.11);
    expect(await budgetAvailable()).toBe(false);
  });

  it('accumulates spend within a day', async () => {
    await recordSpend(0.04);
    await recordSpend(0.04);
    expect(await budgetAvailable()).toBe(true);
    await recordSpend(0.04);  // total now 0.12, over 0.10 ceiling
    expect(await budgetAvailable()).toBe(false);
  });
});
```

- [ ] **Step 4: Implement**

Create `/Users/likerun/Desktop/prompt/apps/api/src/lib/budget.ts`:

```typescript
import { db, schema } from './db';
import { eq, sql } from 'drizzle-orm';

const todayKey = (): string => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

const ceiling = (): number => {
  const raw = process.env.DAILY_BUDGET_CEILING_USD;
  if (!raw) return 10.0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 10.0;
};

export async function budgetAvailable(): Promise<boolean> {
  try {
    const day = todayKey();
    const [row] = await db.select().from(schema.dailySpend).where(eq(schema.dailySpend.day, day));
    const spent = row ? parseFloat(row.cumulativeUsd) : 0;
    return spent < ceiling();
  } catch (err) {
    console.error('[budget] check failed, failing open', { message: err instanceof Error ? err.message : String(err) });
    return true;
  }
}

export async function recordSpend(usd: number): Promise<void> {
  try {
    const day = todayKey();
    await db
      .insert(schema.dailySpend)
      .values({ day, cumulativeUsd: String(usd) })
      .onConflictDoUpdate({
        target: schema.dailySpend.day,
        set: {
          cumulativeUsd: sql`${schema.dailySpend.cumulativeUsd} + ${String(usd)}::numeric`,
          updatedAt: sql`now()`,
        },
      });
  } catch (err) {
    console.error('[budget] record failed (silently dropped)', { message: err instanceof Error ? err.message : String(err) });
  }
}

// Test helper — clears today's spend
export async function resetForTests(): Promise<void> {
  await db.delete(schema.dailySpend);
}
```

- [ ] **Step 5: Run, all pass**

```bash
npm test tests/unit/budget.test.ts
```

Expected: 3 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/budget.ts apps/api/tests/unit/budget.test.ts apps/api/src/schema.ts apps/api/drizzle
git commit -m "feat(api): daily budget cap backed by Postgres"
```

---

### Task B3: IP hashing helper

**Files:**
- Create: `apps/api/src/lib/ip-hash.ts`, `apps/api/tests/unit/ip-hash.test.ts`

- [ ] **Step 1: Write test**

Create `/Users/likerun/Desktop/prompt/apps/api/tests/unit/ip-hash.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { hashIp } from '@/lib/ip-hash';

describe('hashIp', () => {
  it('returns a 64-char hex string', () => {
    expect(hashIp('1.2.3.4')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is stable for same IP', () => {
    expect(hashIp('1.2.3.4')).toBe(hashIp('1.2.3.4'));
  });

  it('differs for different IPs', () => {
    expect(hashIp('1.2.3.4')).not.toBe(hashIp('1.2.3.5'));
  });
});
```

- [ ] **Step 2: Implement**

Create `/Users/likerun/Desktop/prompt/apps/api/src/lib/ip-hash.ts`:

```typescript
import { createHash } from 'node:crypto';

export function hashIp(ip: string): string {
  return createHash('sha256').update(ip).digest('hex');
}
```

- [ ] **Step 3: Run + commit**

```bash
cd /Users/likerun/Desktop/prompt/apps/api
npm test tests/unit/ip-hash.test.ts
git add apps/api/src/lib/ip-hash.ts apps/api/tests/unit/ip-hash.test.ts
cd /Users/likerun/Desktop/prompt
git commit -m "feat(api): SHA-256 IP hashing helper"
```

---

### Task B4: API contracts in `packages/shared`

**Files:**
- Modify: `packages/shared/src/api-contracts.ts`

- [ ] **Step 1: Define request/response types**

Replace `/Users/likerun/Desktop/prompt/packages/shared/src/api-contracts.ts` with:

```typescript
import type { WizardInputs, StudyMode } from './types';

// POST /api/generate
export type GenerateResponse = {
  prompt: string;
  metadata: {
    promptHash: string;
    generator: 'opus' | 'deterministic';
    fallbackReason?: 'budget-exhausted' | 'api-error' | 'feature-disabled';
    generationId: string;  // for use in feedback later
  };
};

// POST /api/feedback
export type FeedbackPayload = {
  generationId: string;
  promptHash: string;
  rating: 1 | 2 | 3 | 4 | 5;
  text?: string;
};
export type FeedbackResponse = { ok: true };

// POST /api/auth/signup, /api/auth/login
export type AuthRequest = { email: string; password: string };
export type AuthResponse = { user: { id: string; email: string; displayName: string | null } };

// GET /api/me
export type MeResponse = {
  user: { id: string; email: string; displayName: string | null };
  profileSummary: string | null;
} | { user: null };  // anonymous

// GET /api/me/history
export type HistoryEntry = {
  id: string;
  createdAt: string;  // ISO
  promptText: string;
  llm: string;
  model: string;
  mode: StudyMode;
  courseId: string | null;
  rating: number | null;
  ratingText: string | null;
};
export type HistoryResponse = {
  entries: HistoryEntry[];
  total: number;
  hasMore: boolean;
};

// Standard error response shape
export type ErrorResponse = { error: string; issues?: Array<{ path: (string | number)[]; message: string }> };
```

Note: `WizardInputs` already exists in `types.ts` and is imported in the route handlers; here we're just exposing it via the contract module.

Also update `/Users/likerun/Desktop/prompt/packages/shared/src/types.ts` — change `GenerateResponse` to match: remove the old type (it'll be defined in api-contracts now). Find the existing `export type GenerateResponse = ...` block and delete it. Same for `FeedbackPayload` if present. They live in api-contracts now.

Then verify nothing in `apps/web` imports the deleted types directly. Use grep and update any references to import from `@composed-prompts/shared` (which exports api-contracts).

- [ ] **Step 2: Verify build still works**

```bash
cd /Users/likerun/Desktop/prompt
npm run test --workspace=apps/web
npm run build --workspace=apps/web
```

Expected: green.

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/api-contracts.ts packages/shared/src/types.ts
git commit -m "feat(shared): API request/response contracts"
```

---

### Task B5: CORS middleware

**Files:**
- Create: `apps/api/src/middleware/cors.ts`

- [ ] **Step 1: Implement**

Create `/Users/likerun/Desktop/prompt/apps/api/src/middleware/cors.ts`:

```typescript
import { cors } from 'hono/cors';

const allowed = (process.env.ALLOWED_ORIGINS ?? 'http://localhost:3100').split(',').map((s) => s.trim());

export const corsMiddleware = cors({
  origin: (origin) => (allowed.includes(origin) ? origin : null),
  credentials: true,
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
  exposeHeaders: ['X-RateLimit-Remaining'],
  maxAge: 600,
});
```

- [ ] **Step 2: Wire into main app**

Modify `/Users/likerun/Desktop/prompt/apps/api/src/index.ts`:

```typescript
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import 'dotenv/config';
import { health } from './routes/health';
import { corsMiddleware } from './middleware/cors';

const app = new Hono();

app.use('*', corsMiddleware);
app.route('/', health);
app.get('/', (c) => c.text('Pomfret Prompt Generator API'));

const port = parseInt(process.env.PORT ?? '8080', 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});

export default app;
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/middleware/cors.ts apps/api/src/index.ts
git commit -m "feat(api): CORS middleware with allowed-origin list"
```

---

### Task B6: Generation pipeline (uses shared Opus + assembler)

**Files:**
- Create: `apps/api/src/lib/pipeline.ts`, `apps/api/tests/unit/pipeline.test.ts`

- [ ] **Step 1: Write failing test**

Create `/Users/likerun/Desktop/prompt/apps/api/tests/unit/pipeline.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WizardInputs } from '@composed-prompts/shared';

const { mockGenerateOpus, mockBudgetCheck, mockBudgetRecord } = vi.hoisted(() => ({
  mockGenerateOpus: vi.fn(),
  mockBudgetCheck: vi.fn(),
  mockBudgetRecord: vi.fn(),
}));

vi.mock('@composed-prompts/shared', async (importActual) => {
  const actual: any = await importActual();
  return {
    ...actual,
    generateFullPromptWithOpus: mockGenerateOpus,
  };
});

vi.mock('@/lib/budget', () => ({
  budgetAvailable: mockBudgetCheck,
  recordSpend: mockBudgetRecord,
}));

import { runPipeline } from '@/lib/pipeline';

const inputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'science-astronomy-ii',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-15',
  hoursAvailable: 2,
  confidence: 3,
};

describe('runPipeline', () => {
  beforeEach(() => {
    mockGenerateOpus.mockReset();
    mockBudgetCheck.mockReset();
    mockBudgetRecord.mockReset();
    mockBudgetCheck.mockResolvedValue(true);
    mockBudgetRecord.mockResolvedValue(undefined);
  });

  it('returns opus prompt when budget OK + API succeeds', async () => {
    mockGenerateOpus.mockResolvedValueOnce({
      ok: true,
      prompt: 'OPUS-WRITTEN PROMPT',
      usage: { input_tokens: 100, output_tokens: 200 },
    });
    const r = await runPipeline(inputs);
    expect(r.generator).toBe('opus');
    expect(r.prompt).toBe('OPUS-WRITTEN PROMPT');
    expect(r.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(mockBudgetRecord).toHaveBeenCalled();
  });

  it('falls back to deterministic when budget exhausted', async () => {
    mockBudgetCheck.mockResolvedValueOnce(false);
    const r = await runPipeline(inputs);
    expect(r.generator).toBe('deterministic');
    expect(r.fallbackReason).toBe('budget-exhausted');
    expect(mockGenerateOpus).not.toHaveBeenCalled();
  });

  it('falls back to deterministic when Opus errors', async () => {
    mockGenerateOpus.mockResolvedValueOnce({ ok: false, error: 'api-error' });
    const r = await runPipeline(inputs);
    expect(r.generator).toBe('deterministic');
    expect(r.fallbackReason).toBe('api-error');
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
cd /Users/likerun/Desktop/prompt/apps/api
npm test tests/unit/pipeline.test.ts
```

- [ ] **Step 3: Implement**

Create `/Users/likerun/Desktop/prompt/apps/api/src/lib/pipeline.ts`:

```typescript
import {
  type WizardInputs,
  assembleDeterministicPrompt,
  generateFullPromptWithOpus,
  promptHash,
} from '@composed-prompts/shared';
import { budgetAvailable, recordSpend } from './budget';

const OPUS_INPUT_USD_PER_MTOK = 5.0;
const OPUS_OUTPUT_USD_PER_MTOK = 25.0;

const estimateOpusSpendUsd = (usage: { input_tokens: number; output_tokens: number }): number =>
  (usage.input_tokens / 1_000_000) * OPUS_INPUT_USD_PER_MTOK +
  (usage.output_tokens / 1_000_000) * OPUS_OUTPUT_USD_PER_MTOK;

export type PipelineResult = {
  prompt: string;
  promptHash: string;
  generator: 'opus' | 'deterministic';
  fallbackReason?: 'budget-exhausted' | 'api-error';
};

export async function runPipeline(inputs: WizardInputs): Promise<PipelineResult> {
  const budgetOk = await budgetAvailable();
  let fallbackReason: PipelineResult['fallbackReason'];

  if (budgetOk) {
    const result = await generateFullPromptWithOpus(inputs);
    if (result.ok) {
      await recordSpend(estimateOpusSpendUsd(result.usage));
      return {
        prompt: result.prompt,
        promptHash: promptHash(result.prompt),
        generator: 'opus',
      };
    }
    fallbackReason = 'api-error';
  } else {
    fallbackReason = 'budget-exhausted';
  }

  const prompt = assembleDeterministicPrompt(inputs);
  return {
    prompt,
    promptHash: promptHash(prompt),
    generator: 'deterministic',
    fallbackReason,
  };
}
```

- [ ] **Step 4: Run, all pass**

```bash
npm test tests/unit/pipeline.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/pipeline.ts apps/api/tests/unit/pipeline.test.ts
git commit -m "feat(api): generation pipeline (Opus + deterministic fallback)"
```

---

### Task B7: POST /api/generate route (TDD)

**Files:**
- Create: `apps/api/src/routes/generate.ts`, `apps/api/tests/integration/generate-route.test.ts`

- [ ] **Step 1: Write failing test**

Create `/Users/likerun/Desktop/prompt/apps/api/tests/integration/generate-route.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { resetAllTables } from '../setup';

const { mockRunPipeline, mockCheckAndRecord } = vi.hoisted(() => ({
  mockRunPipeline: vi.fn(),
  mockCheckAndRecord: vi.fn(),
}));

vi.mock('@/lib/pipeline', () => ({ runPipeline: mockRunPipeline }));
vi.mock('@/lib/rate-limit', () => ({ checkAndRecord: mockCheckAndRecord }));

import { generate } from '@/routes/generate';

const validBody = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'science-astronomy-ii',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-15',
  hoursAvailable: 4,
};

const makeApp = () => {
  const app = new Hono();
  app.route('/', generate);
  return app;
};

const post = async (app: Hono, body: unknown, headers: Record<string, string> = {}): Promise<Response> => {
  return app.request('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', ...headers },
    body: JSON.stringify(body),
  });
};

describe('POST /api/generate', () => {
  beforeEach(async () => {
    mockRunPipeline.mockReset();
    mockCheckAndRecord.mockReset();
    mockCheckAndRecord.mockResolvedValue({ allowed: true, remaining: 19 });
    mockRunPipeline.mockResolvedValue({
      prompt: 'test prompt with <material>fake</material> inside',
      promptHash: 'a'.repeat(64),
      generator: 'opus',
    });
    await resetAllTables();
  });

  it('returns 200 with prompt + metadata + generationId', async () => {
    const res = await post(makeApp(), validBody);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prompt).toBeTruthy();
    expect(body.metadata.generator).toBe('opus');
    expect(body.metadata.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.metadata.generationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns 400 on invalid mode', async () => {
    const res = await post(makeApp(), { ...validBody, mode: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckAndRecord.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const res = await post(makeApp(), validBody);
    expect(res.status).toBe(429);
  });

  it('persists generation with redacted material in prompt_text', async () => {
    const res = await post(makeApp(), { ...validBody, material: 'SENSITIVE NOTES' });
    expect(res.status).toBe(200);
    const { db, schema } = await import('@/lib/db');
    const rows = await db.select().from(schema.generations);
    expect(rows.length).toBe(1);
    expect(rows[0]!.promptText).not.toContain('fake');  // material content scrubbed
    expect(rows[0]!.promptText).toContain('[material redacted');
    const inputs = rows[0]!.inputsJson as Record<string, unknown>;
    expect(inputs.material).toBe('[redacted]');
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
cd /Users/likerun/Desktop/prompt/apps/api
npm test tests/integration/generate-route.test.ts
```

- [ ] **Step 3: Implement**

Create `/Users/likerun/Desktop/prompt/apps/api/src/routes/generate.ts`:

```typescript
import { Hono } from 'hono';
import {
  WizardInputsSchema,
  redactMaterialForHistory,
  type GenerateResponse,
} from '@composed-prompts/shared';
import { runPipeline } from '@/lib/pipeline';
import { checkAndRecord } from '@/lib/rate-limit';
import { hashIp } from '@/lib/ip-hash';
import { db, schema } from '@/lib/db';

export const generate = new Hono();

const RATE_LIMIT_PER_IP_PER_DAY = parseInt(process.env.RATE_LIMIT_PER_IP_PER_DAY ?? '20', 10);

const getIp = (c: { req: { header: (k: string) => string | undefined } }): string => {
  const fwd = c.req.header('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return c.req.header('x-real-ip') ?? 'unknown';
};

const redactInputsForStorage = (inputs: Record<string, unknown>): Record<string, unknown> => ({
  ...inputs,
  material: inputs.material ? '[redacted]' : undefined,
  understanding: inputs.understanding ? '[redacted]' : undefined,
  confusion: inputs.confusion ? '[redacted]' : undefined,
});

generate.post('/api/generate', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON' }, 400);
  }

  const parsed = WizardInputsSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid input', issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }, 400);
  }
  const inputs = parsed.data;

  const ip = getIp(c);
  const limit = await checkAndRecord(`ip:${hashIp(ip)}`, { limit: RATE_LIMIT_PER_IP_PER_DAY, windowSeconds: 24 * 60 * 60 });
  if (!limit.allowed) {
    return c.json({ error: 'rate limit exceeded; try again tomorrow' }, 429);
  }

  try {
    const result = await runPipeline(inputs);

    // Persist the generation
    const scrubbedPrompt = redactMaterialForHistory(result.prompt);
    const [inserted] = await db
      .insert(schema.generations)
      .values({
        ipHash: hashIp(ip),
        inputsJson: redactInputsForStorage(inputs as unknown as Record<string, unknown>),
        promptText: scrubbedPrompt,
        promptHash: result.promptHash,
        generator: result.generator,
        courseId: inputs.courseId,
        mode: inputs.mode,
        provider: inputs.provider,
        model: inputs.model,
        fallbackReason: result.fallbackReason ?? null,
      })
      .returning({ id: schema.generations.id });

    const response: GenerateResponse = {
      prompt: result.prompt,
      metadata: {
        promptHash: result.promptHash,
        generator: result.generator,
        generationId: inserted!.id,
        ...(result.fallbackReason ? { fallbackReason: result.fallbackReason } : {}),
      },
    };
    return c.json(response, 200);
  } catch (err) {
    console.error('generate failed', {
      message: err instanceof Error ? err.message : 'unknown',
      input: redactInputsForStorage(inputs as unknown as Record<string, unknown>),
    });
    return c.json({ error: 'internal error' }, 500);
  }
});
```

- [ ] **Step 4: Run, all pass**

```bash
npm test tests/integration/generate-route.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Wire route into main app**

Edit `/Users/likerun/Desktop/prompt/apps/api/src/index.ts`:

```typescript
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import 'dotenv/config';
import { health } from './routes/health';
import { generate } from './routes/generate';
import { corsMiddleware } from './middleware/cors';

const app = new Hono();

app.use('*', corsMiddleware);
app.route('/', health);
app.route('/', generate);
app.get('/', (c) => c.text('Pomfret Prompt Generator API'));

const port = parseInt(process.env.PORT ?? '8080', 10);

serve({ fetch: app.fetch, port }, (info) => {
  console.log(`API listening on http://localhost:${info.port}`);
});

export default app;
```

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/generate.ts apps/api/tests/integration/generate-route.test.ts apps/api/src/index.ts
git commit -m "feat(api): POST /api/generate with persistence + rate limiting"
```

---

### Task B8: POST /api/feedback route (TDD)

**Files:**
- Create: `apps/api/src/routes/feedback.ts`, `apps/api/tests/integration/feedback-route.test.ts`

- [ ] **Step 1: Write failing test**

Create `/Users/likerun/Desktop/prompt/apps/api/tests/integration/feedback-route.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { feedback } from '@/routes/feedback';
import { db, schema } from '@/lib/db';
import { resetAllTables } from '../setup';

const makeApp = () => {
  const app = new Hono();
  app.route('/', feedback);
  return app;
};

const post = (app: Hono, body: unknown): Promise<Response> =>
  app.request('/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const seedGeneration = async (): Promise<string> => {
  const [g] = await db
    .insert(schema.generations)
    .values({
      inputsJson: {},
      promptText: 'test',
      promptHash: 'a'.repeat(64),
      generator: 'opus',
      mode: 'cram-review',
      provider: 'anthropic',
      model: 'claude-opus-4-7',
    })
    .returning({ id: schema.generations.id });
  return g!.id;
};

describe('POST /api/feedback', () => {
  beforeEach(async () => {
    await resetAllTables();
  });

  it('accepts a valid feedback payload', async () => {
    const genId = await seedGeneration();
    const res = await post(makeApp(), {
      generationId: genId,
      promptHash: 'a'.repeat(64),
      rating: 4,
    });
    expect(res.status).toBe(200);
    const rows = await db.select().from(schema.feedback);
    expect(rows.length).toBe(1);
    expect(rows[0]!.rating).toBe(4);
  });

  it('rejects rating outside 1-5', async () => {
    const genId = await seedGeneration();
    const res = await post(makeApp(), { generationId: genId, promptHash: 'a'.repeat(64), rating: 99 });
    expect(res.status).toBe(400);
  });

  it('rejects missing generationId', async () => {
    const res = await post(makeApp(), { promptHash: 'a'.repeat(64), rating: 4 });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate feedback for same generation', async () => {
    const genId = await seedGeneration();
    await post(makeApp(), { generationId: genId, promptHash: 'a'.repeat(64), rating: 3 });
    const res2 = await post(makeApp(), { generationId: genId, promptHash: 'a'.repeat(64), rating: 5 });
    expect(res2.status).toBe(409);
  });

  it('returns 404 for unknown generationId', async () => {
    const res = await post(makeApp(), { generationId: '00000000-0000-0000-0000-000000000000', promptHash: 'a'.repeat(64), rating: 4 });
    expect(res.status).toBe(404);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
cd /Users/likerun/Desktop/prompt/apps/api
npm test tests/integration/feedback-route.test.ts
```

- [ ] **Step 3: Implement**

Create `/Users/likerun/Desktop/prompt/apps/api/src/routes/feedback.ts`:

```typescript
import { Hono } from 'hono';
import { z } from 'zod';
import { db, schema } from '@/lib/db';
import { eq } from 'drizzle-orm';

export const feedback = new Hono();

const FeedbackSchema = z.object({
  generationId: z.string().uuid(),
  promptHash: z.string().length(64),
  rating: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
  text: z.string().max(1000).optional(),
});

feedback.post('/api/feedback', async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON' }, 400);
  }

  const parsed = FeedbackSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid input', issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }, 400);
  }

  // Verify generation exists
  const [gen] = await db.select().from(schema.generations).where(eq(schema.generations.id, parsed.data.generationId));
  if (!gen) {
    return c.json({ error: 'generation not found' }, 404);
  }

  // Insert feedback (unique constraint on generation_id prevents duplicates)
  try {
    await db.insert(schema.feedback).values({
      generationId: parsed.data.generationId,
      rating: parsed.data.rating,
      text: parsed.data.text ?? null,
    });
    return c.json({ ok: true }, 200);
  } catch (err) {
    // Likely unique-constraint violation
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('unique') || message.includes('duplicate')) {
      return c.json({ error: 'feedback already submitted for this generation' }, 409);
    }
    console.error('feedback insert failed', { message });
    return c.json({ error: 'internal error' }, 500);
  }
});
```

- [ ] **Step 4: Run, all pass**

```bash
npm test tests/integration/feedback-route.test.ts
```

Expected: 5 passing.

- [ ] **Step 5: Wire route**

Edit `/Users/likerun/Desktop/prompt/apps/api/src/index.ts` — add `import { feedback } from './routes/feedback';` and `app.route('/', feedback);`.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/feedback.ts apps/api/tests/integration/feedback-route.test.ts apps/api/src/index.ts
git commit -m "feat(api): POST /api/feedback with duplicate protection"
```

---

### Task B9: Deploy backend + smoke test live endpoints

**Files:** none (deploy)

- [ ] **Step 1: Deploy**

```bash
cd /Users/likerun/Desktop/prompt
fly deploy -c apps/api/fly.toml --dockerfile apps/api/Dockerfile
```

Expected: builds + deploys. URL: `https://composed-prompts-api.fly.dev`.

- [ ] **Step 2: Verify health**

```bash
curl https://composed-prompts-api.fly.dev/health
```

Expected: `{"ok":true}`.

- [ ] **Step 3: Verify generate end-to-end**

```bash
curl -X POST https://composed-prompts-api.fly.dev/api/generate \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "anthropic",
    "model": "claude-opus-4-7",
    "courseId": "science-astronomy-ii",
    "mode": "cram-review",
    "assessmentType": "test",
    "assessmentDate": "2026-06-15",
    "hoursAvailable": 2
  }' | python3 -c "import sys, json; d=json.load(sys.stdin); m=d.get('metadata', {}); print('generator:', m.get('generator')); print('generationId:', m.get('generationId'))"
```

Expected: `generator: opus`, `generationId: <uuid>`.

If `generator: deterministic` and `fallbackReason: api-error`, the ANTHROPIC_API_KEY isn't set correctly on Fly. Check with `fly secrets list -a composed-prompts-api`.

- [ ] **Step 4: Verify feedback against the generationId returned**

```bash
GEN_ID="<paste-the-generationId-from-prev-step>"
curl -X POST https://composed-prompts-api.fly.dev/api/feedback \
  -H "Content-Type: application/json" \
  -d "{\"generationId\":\"$GEN_ID\",\"promptHash\":\"$(echo -n test | shasum -a 256 | cut -d' ' -f1)\",\"rating\":4}"
```

Expected: returns 200 (or 409 if you submit twice). The promptHash actually won't match the real prompt — that's fine for this smoke test.

---

### Task B10: Frontend API client wrapper

**Files:**
- Create: `apps/web/lib/api-client.ts`

- [ ] **Step 1: Create wrapper**

Create `/Users/likerun/Desktop/prompt/apps/web/lib/api-client.ts`:

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? '';

export async function apiPost<TRes>(path: string, body: unknown): Promise<TRes> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    credentials: 'include',
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(errBody.error ?? `Request failed (${res.status})`, res.status, errBody);
  }
  return res.json() as Promise<TRes>;
}

export async function apiGet<TRes>(path: string): Promise<TRes> {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(errBody.error ?? `Request failed (${res.status})`, res.status, errBody);
  }
  return res.json() as Promise<TRes>;
}

export class ApiError extends Error {
  constructor(message: string, public status: number, public body: unknown) {
    super(message);
    this.name = 'ApiError';
  }
}
```

- [ ] **Step 2: Update wizard page to use the API client**

Edit `/Users/likerun/Desktop/prompt/apps/web/app/wizard/page.tsx`. Find the existing `submit` function and replace its `fetch('/api/generate', ...)` call with:

```typescript
import { apiPost } from '@/lib/api-client';
import type { GenerateResponse } from '@composed-prompts/shared';

// inside submit():
const data = await apiPost<GenerateResponse>('/api/generate', payload);
```

Remove the inline `fetch` + `res.ok` handling — the `apiPost` wrapper handles non-2xx by throwing.

Also update the FeedbackForm in `apps/web/components/FeedbackForm.tsx` similarly — replace its `fetch('/api/feedback', ...)` with `apiPost('/api/feedback', {...})`. Note: feedback body must now include `generationId` (from the GenerateResponse), so the FeedbackForm needs that as a prop.

Update `app/wizard/result/page.tsx` to pass `data.metadata.generationId` to `<FeedbackForm>`.

- [ ] **Step 3: Add env var to Vercel + local**

User adds in Vercel dashboard:
- Settings → Environment Variables → Add
- Key: `NEXT_PUBLIC_API_BASE_URL`
- Value: `https://composed-prompts-api.fly.dev`
- Environments: Production + Preview

Locally, edit `/Users/likerun/Desktop/prompt/apps/web/.env.local` and add:
```
NEXT_PUBLIC_API_BASE_URL=http://localhost:8080
```

(For local dev, point at the local backend. For production, Vercel uses the Fly URL.)

- [ ] **Step 4: Local end-to-end smoke**

In one terminal:
```bash
cd /Users/likerun/Desktop/prompt/apps/api
npm run dev
```

In another:
```bash
cd /Users/likerun/Desktop/prompt/apps/web
npm run dev
```

Visit http://localhost:3100 → walk wizard → confirm a prompt is generated and the result page shows. Rate the prompt → verify the rating saves (check Neon dashboard → feedback table).

- [ ] **Step 5: Commit + push**

```bash
cd /Users/likerun/Desktop/prompt
git add apps/web/lib/api-client.ts apps/web/app/wizard/page.tsx apps/web/components/FeedbackForm.tsx apps/web/app/wizard/result/page.tsx
git commit -m "feat(web): switch to apiPost/apiGet against new backend"
git push origin main
```

Vercel auto-deploys with the new env var.

---

### Task B11: Cutover verification + delete old Vercel routes

**Files:**
- Delete: `apps/web/app/api/generate/route.ts`, `apps/web/app/api/feedback/route.ts`

- [ ] **Step 1: Verify production traffic hits new backend**

Wait for Vercel deploy. Visit https://composed-prompts.vercel.app → walk wizard. Then check Fly logs:

```bash
fly logs -a composed-prompts-api
```

You should see `POST /api/generate` log entries from the production request.

Also verify in Neon dashboard that a new row appeared in the `generations` table.

- [ ] **Step 2: Delete old Next.js routes**

```bash
cd /Users/likerun/Desktop/prompt
git rm -r apps/web/app/api/generate apps/web/app/api/feedback
git commit -m "chore: remove old Vercel API routes; backend now hosted on Fly"
git push origin main
```

- [ ] **Step 3: Verify production still works after deletion**

After Vercel redeploys, hit https://composed-prompts.vercel.app/wizard again, generate, confirm.

**Phase B done.** Backend handles all generation. Postgres has every generation persisted. Old Vercel routes deleted. No RAG yet.

---

## Phase C — Auth

Goal: Add user accounts. Anonymous use still works. Sessions managed by Lucia. Frontend has login/signup pages and an auth state hook.

---

### Task C1: Install Lucia + bcrypt; configure adapter

**Files:**
- Modify: `apps/api/package.json` (deps already added in A4 but verify)
- Create: `apps/api/src/lib/auth.ts`

- [ ] **Step 1: Verify deps installed**

```bash
cd /Users/likerun/Desktop/prompt
grep -E "lucia|bcryptjs|adapter-drizzle" apps/api/package.json
```

If any missing, `npm install` again from the repo root.

- [ ] **Step 2: Create Lucia setup**

Create `/Users/likerun/Desktop/prompt/apps/api/src/lib/auth.ts`:

```typescript
import { Lucia } from 'lucia';
import { DrizzlePostgreSQLAdapter } from '@lucia-auth/adapter-drizzle';
import { db, schema } from './db';

const adapter = new DrizzlePostgreSQLAdapter(db, schema.sessions, schema.users);

export const lucia = new Lucia(adapter, {
  sessionCookie: {
    name: 'composed-prompts-session',
    expires: false,
    attributes: {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      // domain undefined = host-only cookie on api.fly.dev
    },
  },
  getUserAttributes: (attrs) => ({
    email: attrs.email,
    displayName: attrs.display_name,
  }),
});

declare module 'lucia' {
  interface Register {
    Lucia: typeof lucia;
    DatabaseUserAttributes: { email: string; display_name: string | null };
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/auth.ts
git commit -m "feat(api): Lucia auth client + Drizzle adapter"
```

---

### Task C2: Session middleware

**Files:**
- Create: `apps/api/src/middleware/session.ts`

- [ ] **Step 1: Implement**

Create `/Users/likerun/Desktop/prompt/apps/api/src/middleware/session.ts`:

```typescript
import type { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';
import { lucia } from '@/lib/auth';

declare module 'hono' {
  interface ContextVariableMap {
    user: { id: string; email: string; displayName: string | null } | null;
    sessionId: string | null;
  }
}

export const sessionMiddleware: MiddlewareHandler = async (c, next) => {
  const cookieName = lucia.sessionCookieName;
  const sessionId = getCookie(c, cookieName) ?? null;

  if (!sessionId) {
    c.set('user', null);
    c.set('sessionId', null);
    return next();
  }

  const { session, user } = await lucia.validateSession(sessionId);

  if (session && session.fresh) {
    const cookie = lucia.createSessionCookie(session.id);
    setCookie(c, cookie.name, cookie.value, cookie.attributes);
  }

  if (!session) {
    const cookie = lucia.createBlankSessionCookie();
    setCookie(c, cookie.name, cookie.value, cookie.attributes);
    c.set('user', null);
    c.set('sessionId', null);
    return next();
  }

  c.set('user', user as { id: string; email: string; displayName: string | null });
  c.set('sessionId', session.id);
  return next();
};
```

- [ ] **Step 2: Wire middleware**

Edit `/Users/likerun/Desktop/prompt/apps/api/src/index.ts` — add `app.use('*', sessionMiddleware)` AFTER `corsMiddleware` and BEFORE routes:

```typescript
app.use('*', corsMiddleware);
app.use('*', sessionMiddleware);
app.route('/', health);
app.route('/', generate);
app.route('/', feedback);
```

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/middleware/session.ts apps/api/src/index.ts
git commit -m "feat(api): session middleware (Lucia cookie parsing)"
```

---

### Task C3: Auth routes — signup/login/logout (TDD)

**Files:**
- Create: `apps/api/src/routes/auth.ts`, `apps/api/tests/integration/auth-routes.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/Users/likerun/Desktop/prompt/apps/api/tests/integration/auth-routes.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { auth } from '@/routes/auth';
import { sessionMiddleware } from '@/middleware/session';
import { db, schema } from '@/lib/db';
import { resetAllTables } from '../setup';

const makeApp = () => {
  const app = new Hono();
  app.use('*', sessionMiddleware);
  app.route('/', auth);
  return app;
};

const post = (app: Hono, path: string, body: unknown, cookie?: string): Promise<Response> =>
  app.request(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(cookie ? { cookie } : {}),
    },
    body: JSON.stringify(body),
  });

describe('auth routes', () => {
  beforeEach(async () => {
    await resetAllTables();
  });

  it('POST /api/auth/signup creates user + returns session cookie', async () => {
    const res = await post(makeApp(), '/api/auth/signup', { email: 'a@test.com', password: 'longenough123' });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe('a@test.com');
    expect(res.headers.get('set-cookie')).toMatch(/composed-prompts-session=/);
    const users = await db.select().from(schema.users);
    expect(users.length).toBe(1);
  });

  it('POST /api/auth/signup rejects short password', async () => {
    const res = await post(makeApp(), '/api/auth/signup', { email: 'a@test.com', password: 'short' });
    expect(res.status).toBe(400);
  });

  it('POST /api/auth/signup rejects duplicate email', async () => {
    await post(makeApp(), '/api/auth/signup', { email: 'a@test.com', password: 'longenough123' });
    const res = await post(makeApp(), '/api/auth/signup', { email: 'a@test.com', password: 'differentpw1' });
    expect(res.status).toBe(409);
  });

  it('POST /api/auth/login validates + returns cookie', async () => {
    await post(makeApp(), '/api/auth/signup', { email: 'a@test.com', password: 'longenough123' });
    const res = await post(makeApp(), '/api/auth/login', { email: 'a@test.com', password: 'longenough123' });
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/composed-prompts-session=/);
  });

  it('POST /api/auth/login rejects wrong password', async () => {
    await post(makeApp(), '/api/auth/signup', { email: 'a@test.com', password: 'longenough123' });
    const res = await post(makeApp(), '/api/auth/login', { email: 'a@test.com', password: 'wrong-password-1' });
    expect(res.status).toBe(401);
  });

  it('POST /api/auth/logout clears session', async () => {
    const signup = await post(makeApp(), '/api/auth/signup', { email: 'a@test.com', password: 'longenough123' });
    const cookie = signup.headers.get('set-cookie')!.split(';')[0]!;
    const res = await post(makeApp(), '/api/auth/logout', {}, cookie);
    expect(res.status).toBe(200);
    expect(res.headers.get('set-cookie')).toMatch(/Max-Age=0/);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
cd /Users/likerun/Desktop/prompt/apps/api
npm test tests/integration/auth-routes.test.ts
```

- [ ] **Step 3: Implement**

Create `/Users/likerun/Desktop/prompt/apps/api/src/routes/auth.ts`:

```typescript
import { Hono } from 'hono';
import { setCookie } from 'hono/cookie';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { lucia } from '@/lib/auth';
import { db, schema } from '@/lib/db';

export const auth = new Hono();

const SignupSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(10).max(200),
});

const LoginSchema = SignupSchema;

auth.post('/api/auth/signup', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = SignupSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid input', issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) }, 400);
  }
  const { email, password } = parsed.data;
  const [existing] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (existing) {
    return c.json({ error: 'email already registered' }, 409);
  }
  const passwordHash = await bcrypt.hash(password, 10);
  const [newUser] = await db
    .insert(schema.users)
    .values({ email, passwordHash, displayName: null })
    .returning({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName });
  const session = await lucia.createSession(newUser!.id, {});
  const cookie = lucia.createSessionCookie(session.id);
  setCookie(c, cookie.name, cookie.value, cookie.attributes);
  return c.json({ user: { id: newUser!.id, email: newUser!.email, displayName: newUser!.displayName } }, 200);
});

auth.post('/api/auth/login', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const parsed = LoginSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'invalid input' }, 400);
  }
  const { email, password } = parsed.data;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email));
  if (!user) {
    return c.json({ error: 'invalid email or password' }, 401);
  }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return c.json({ error: 'invalid email or password' }, 401);
  }
  const session = await lucia.createSession(user.id, {});
  const cookie = lucia.createSessionCookie(session.id);
  setCookie(c, cookie.name, cookie.value, cookie.attributes);
  return c.json({ user: { id: user.id, email: user.email, displayName: user.displayName } }, 200);
});

auth.post('/api/auth/logout', async (c) => {
  const sessionId = c.get('sessionId');
  if (sessionId) {
    await lucia.invalidateSession(sessionId);
  }
  const blank = lucia.createBlankSessionCookie();
  setCookie(c, blank.name, blank.value, blank.attributes);
  return c.json({ ok: true }, 200);
});
```

- [ ] **Step 4: Wire routes**

Edit `apps/api/src/index.ts`:
```typescript
import { auth } from './routes/auth';
app.route('/', auth);
```

- [ ] **Step 5: Run, all pass**

```bash
npm test tests/integration/auth-routes.test.ts
```

Expected: 6 passing.

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/routes/auth.ts apps/api/tests/integration/auth-routes.test.ts apps/api/src/index.ts
git commit -m "feat(api): auth routes — signup/login/logout via Lucia"
```

---

### Task C4: GET /api/me endpoint

**Files:**
- Create: `apps/api/src/routes/me.ts`, `apps/api/tests/integration/me-route.test.ts`

- [ ] **Step 1: Write failing test**

Create `/Users/likerun/Desktop/prompt/apps/api/tests/integration/me-route.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { me } from '@/routes/me';
import { auth } from '@/routes/auth';
import { sessionMiddleware } from '@/middleware/session';
import { resetAllTables } from '../setup';

const makeApp = () => {
  const app = new Hono();
  app.use('*', sessionMiddleware);
  app.route('/', auth);
  app.route('/', me);
  return app;
};

describe('GET /api/me', () => {
  beforeEach(async () => {
    await resetAllTables();
  });

  it('returns user: null when no session', async () => {
    const res = await makeApp().request('/api/me');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user).toBeNull();
  });

  it('returns user when session valid', async () => {
    const app = makeApp();
    const signup = await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'me@test.com', password: 'longenough123' }),
    });
    const cookie = signup.headers.get('set-cookie')!.split(';')[0]!;
    const res = await app.request('/api/me', { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe('me@test.com');
    expect(body.profileSummary).toBeNull();
  });
});
```

- [ ] **Step 2: Implement**

Create `/Users/likerun/Desktop/prompt/apps/api/src/routes/me.ts`:

```typescript
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { db, schema } from '@/lib/db';

export const me = new Hono();

me.get('/api/me', async (c) => {
  const user = c.get('user');
  if (!user) {
    return c.json({ user: null }, 200);
  }
  const [profile] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, user.id));
  return c.json({
    user: { id: user.id, email: user.email, displayName: user.displayName },
    profileSummary: profile?.summary ?? null,
  }, 200);
});
```

- [ ] **Step 3: Wire + test + commit**

```bash
cd /Users/likerun/Desktop/prompt/apps/api
# Wire in src/index.ts: app.route('/', me);
npm test tests/integration/me-route.test.ts   # 2 passing
git add apps/api/src/routes/me.ts apps/api/tests/integration/me-route.test.ts apps/api/src/index.ts
git commit -m "feat(api): GET /api/me returns user + profile summary"
```

---

### Task C5: Frontend useAuth hook

**Files:**
- Create: `apps/web/lib/use-auth.ts`

- [ ] **Step 1: Implement**

Create `/Users/likerun/Desktop/prompt/apps/web/lib/use-auth.ts`:

```typescript
'use client';

import { useEffect, useState, useCallback } from 'react';
import { apiGet, apiPost } from '@/lib/api-client';
import type { MeResponse } from '@composed-prompts/shared';

export type AuthUser = { id: string; email: string; displayName: string | null };

type AuthState =
  | { status: 'loading'; user: null }
  | { status: 'anonymous'; user: null }
  | { status: 'authed'; user: AuthUser; profileSummary: string | null };

export function useAuth() {
  const [state, setState] = useState<AuthState>({ status: 'loading', user: null });

  useEffect(() => {
    apiGet<MeResponse>('/api/me')
      .then((data) => {
        if (data.user) {
          setState({ status: 'authed', user: data.user, profileSummary: 'profileSummary' in data ? data.profileSummary : null });
        } else {
          setState({ status: 'anonymous', user: null });
        }
      })
      .catch(() => setState({ status: 'anonymous', user: null }));
  }, []);

  const signOut = useCallback(async () => {
    await apiPost('/api/auth/logout', {});
    setState({ status: 'anonymous', user: null });
  }, []);

  return { ...state, signOut };
}
```

- [ ] **Step 2: Commit**

```bash
cd /Users/likerun/Desktop/prompt
git add apps/web/lib/use-auth.ts
git commit -m "feat(web): useAuth hook for client-side auth state"
```

---

### Task C6: Frontend signup + login pages

**Files:**
- Create: `apps/web/app/signup/page.tsx`, `apps/web/app/login/page.tsx`, `apps/web/components/auth/AuthForm.tsx`

- [ ] **Step 1: Create reusable AuthForm component**

Create `/Users/likerun/Desktop/prompt/apps/web/components/auth/AuthForm.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { apiPost, ApiError } from '@/lib/api-client';
import type { AuthResponse } from '@composed-prompts/shared';

export function AuthForm({ mode }: { mode: 'login' | 'signup' }) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const submit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const path = mode === 'login' ? '/api/auth/login' : '/api/auth/signup';
      await apiPost<AuthResponse>(path, { email, password });
      router.push('/account');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong');
      setSubmitting(false);
    }
  };

  const title = mode === 'login' ? 'Sign in' : 'Create account';
  const cta = mode === 'login' ? 'Sign in' : 'Sign up';
  const altText = mode === 'login' ? "Don't have an account?" : 'Already have an account?';
  const altLink = mode === 'login' ? '/signup' : '/login';
  const altLinkText = mode === 'login' ? 'Sign up' : 'Sign in';

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <form onSubmit={submit} className="mt-8 grid gap-4">
        <div>
          <Label htmlFor="email">Email</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1" />
        </div>
        <div>
          <Label htmlFor="password">Password (min 10 chars)</Label>
          <Input id="password" type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1" />
        </div>
        {error && (
          <Alert>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Button type="submit" disabled={submitting}>
          {submitting ? '...' : cta}
        </Button>
      </form>
      <p className="mt-6 text-sm text-slate-500">
        {altText}{' '}
        <Link href={altLink} className="underline">{altLinkText}</Link>
      </p>
    </main>
  );
}
```

- [ ] **Step 2: Create pages**

Create `/Users/likerun/Desktop/prompt/apps/web/app/login/page.tsx`:

```tsx
import { AuthForm } from '@/components/auth/AuthForm';
export default function LoginPage() {
  return <AuthForm mode="login" />;
}
```

Create `/Users/likerun/Desktop/prompt/apps/web/app/signup/page.tsx`:

```tsx
import { AuthForm } from '@/components/auth/AuthForm';
export default function SignupPage() {
  return <AuthForm mode="signup" />;
}
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/auth/AuthForm.tsx apps/web/app/login apps/web/app/signup
git commit -m "feat(web): login + signup pages with shared AuthForm"
```

---

### Task C7: AuthHeader component + Account page

**Files:**
- Create: `apps/web/components/auth/AuthHeader.tsx`, `apps/web/app/account/page.tsx`
- Modify: `apps/web/app/layout.tsx` (mount header)

- [ ] **Step 1: AuthHeader**

Create `/Users/likerun/Desktop/prompt/apps/web/components/auth/AuthHeader.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/lib/use-auth';

export function AuthHeader() {
  const auth = useAuth();

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/" className="text-sm font-semibold">Pomfret Study Prompts</Link>
        <nav className="flex items-center gap-3">
          {auth.status === 'loading' && <span className="text-xs text-slate-400">…</span>}
          {auth.status === 'anonymous' && (
            <>
              <Link href="/login"><Button variant="ghost" size="sm">Sign in</Button></Link>
              <Link href="/signup"><Button size="sm">Sign up</Button></Link>
            </>
          )}
          {auth.status === 'authed' && (
            <>
              <Link href="/history"><Button variant="ghost" size="sm">History</Button></Link>
              <Link href="/account"><Button variant="ghost" size="sm">{auth.user.email}</Button></Link>
              <Button variant="outline" size="sm" onClick={auth.signOut}>Sign out</Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Account page**

Create `/Users/likerun/Desktop/prompt/apps/web/app/account/page.tsx`:

```tsx
'use client';

import Link from 'next/link';
import { useAuth } from '@/lib/use-auth';
import { Button } from '@/components/ui/button';

export default function AccountPage() {
  const auth = useAuth();

  if (auth.status === 'loading') return <main className="mx-auto max-w-md px-6 py-16">Loading…</main>;
  if (auth.status === 'anonymous') {
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <p>You&apos;re not signed in.</p>
        <div className="mt-4 flex gap-2">
          <Link href="/login"><Button>Sign in</Button></Link>
          <Link href="/signup"><Button variant="outline">Sign up</Button></Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold">Your account</h1>
      <dl className="mt-6 grid gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Email</dt>
          <dd className="font-medium">{auth.user.email}</dd>
        </div>
        {auth.profileSummary && (
          <div>
            <dt className="text-slate-500">What we&apos;ve learned about your study style</dt>
            <dd className="mt-1 rounded border bg-white p-3 text-xs leading-relaxed">{auth.profileSummary}</dd>
          </div>
        )}
      </dl>
      <Button variant="outline" className="mt-8" onClick={auth.signOut}>Sign out</Button>
    </main>
  );
}
```

- [ ] **Step 3: Mount AuthHeader in layout**

Edit `/Users/likerun/Desktop/prompt/apps/web/app/layout.tsx` — import AuthHeader and place it inside `<body>` before `{children}`.

```tsx
import { AuthHeader } from '@/components/auth/AuthHeader';

// inside the return:
<body>
  <AuthHeader />
  {children}
</body>
```

- [ ] **Step 4: Build + smoke**

```bash
cd /Users/likerun/Desktop/prompt/apps/web
npm run build
```

Expected: builds successfully.

- [ ] **Step 5: Commit**

```bash
git add apps/web/components/auth/AuthHeader.tsx apps/web/app/account apps/web/app/layout.tsx
git commit -m "feat(web): AuthHeader + Account page"
```

---

### Task C8: Deploy + verify auth flow

**Files:** none (deploy)

- [ ] **Step 1: Deploy backend**

```bash
cd /Users/likerun/Desktop/prompt
fly deploy -c apps/api/fly.toml --dockerfile apps/api/Dockerfile
git push origin main   # triggers Vercel deploy for frontend
```

- [ ] **Step 2: End-to-end auth verification**

Visit https://composed-prompts.vercel.app:
1. See "Sign in" / "Sign up" in header
2. Click Sign up → form appears
3. Submit with email + password (≥10 chars) → redirects to /account showing email
4. Refresh — still signed in
5. Click Sign out → header reverts
6. Click Sign in → log back in → /account again

If any step fails, check Fly logs: `fly logs -a composed-prompts-api`.

**Phase C done.** Auth works in production.

---

## Phase D — Server-Side History

Goal: When a user is logged in, their generations get tied to their user_id and they can view full history from the server. Anonymous users keep localStorage.

---

### Task D1: Update generate route to attach user_id when authed

**Files:**
- Modify: `apps/api/src/routes/generate.ts`
- Modify: `apps/api/tests/integration/generate-route.test.ts` (add a test)

- [ ] **Step 1: Add user_id support to generate**

Edit `/Users/likerun/Desktop/prompt/apps/api/src/routes/generate.ts` — in the `.values({...})` call to insert the generation, add `userId: c.get('user')?.id ?? null,`.

Also wire `sessionMiddleware` if not already: the route's `app.use('*', sessionMiddleware)` in index.ts already covers all routes including this one.

- [ ] **Step 2: Add test**

Append to `/Users/likerun/Desktop/prompt/apps/api/tests/integration/generate-route.test.ts`:

```typescript
  it('attaches userId when session present', async () => {
    // Setup: signup to get a session
    const setupApp = (() => {
      const a = new Hono();
      a.use('*', sessionMiddleware);
      a.route('/', authRoutes);
      a.route('/', generate);
      return a;
    })();
    const signup = await setupApp.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'u@test.com', password: 'longenough123' }),
    });
    const cookie = signup.headers.get('set-cookie')!.split(';')[0]!;

    const res = await setupApp.request('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', cookie },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(200);
    const { db, schema } = await import('@/lib/db');
    const rows = await db.select().from(schema.generations);
    expect(rows[0]!.userId).not.toBeNull();
  });
```

At the top of the test file, add imports:
```typescript
import { sessionMiddleware } from '@/middleware/session';
import { auth as authRoutes } from '@/routes/auth';
```

- [ ] **Step 3: Run + commit**

```bash
cd /Users/likerun/Desktop/prompt/apps/api
npm test tests/integration/generate-route.test.ts   # 5 passing now
git add apps/api/src/routes/generate.ts apps/api/tests/integration/generate-route.test.ts
git commit -m "feat(api): attach user_id to generations when session present"
```

---

### Task D2: GET /api/me/history with pagination (TDD)

**Files:**
- Create: `apps/api/tests/integration/history-route.test.ts`
- Modify: `apps/api/src/routes/me.ts`

- [ ] **Step 1: Write failing test**

Create `/Users/likerun/Desktop/prompt/apps/api/tests/integration/history-route.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { me } from '@/routes/me';
import { auth } from '@/routes/auth';
import { generate } from '@/routes/generate';
import { sessionMiddleware } from '@/middleware/session';
import { resetAllTables } from '../setup';
import { vi } from 'vitest';

vi.mock('@/lib/pipeline', () => ({
  runPipeline: vi.fn().mockResolvedValue({
    prompt: 'test prompt',
    promptHash: 'a'.repeat(64),
    generator: 'opus',
  }),
}));
vi.mock('@/lib/rate-limit', () => ({
  checkAndRecord: vi.fn().mockResolvedValue({ allowed: true, remaining: 19 }),
}));

const makeApp = () => {
  const a = new Hono();
  a.use('*', sessionMiddleware);
  a.route('/', auth);
  a.route('/', generate);
  a.route('/', me);
  return a;
};

const validInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'science-astronomy-ii',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-15',
  hoursAvailable: 2,
};

describe('GET /api/me/history', () => {
  beforeEach(async () => {
    await resetAllTables();
  });

  it('returns 401 when anonymous', async () => {
    const res = await makeApp().request('/api/me/history');
    expect(res.status).toBe(401);
  });

  it('returns empty list for new user', async () => {
    const app = makeApp();
    const signup = await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'h@test.com', password: 'longenough123' }),
    });
    const cookie = signup.headers.get('set-cookie')!.split(';')[0]!;
    const res = await app.request('/api/me/history', { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns entries newest-first', async () => {
    const app = makeApp();
    const signup = await app.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'h@test.com', password: 'longenough123' }),
    });
    const cookie = signup.headers.get('set-cookie')!.split(';')[0]!;
    // Generate 3 prompts
    for (let i = 0; i < 3; i++) {
      await app.request('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', cookie },
        body: JSON.stringify(validInputs),
      });
      await new Promise((r) => setTimeout(r, 10));  // ensure distinct created_at
    }
    const res = await app.request('/api/me/history', { headers: { cookie } });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries.length).toBe(3);
    expect(body.total).toBe(3);
    expect(new Date(body.entries[0].createdAt).getTime())
      .toBeGreaterThan(new Date(body.entries[2].createdAt).getTime());
  });

  it('does not return other users entries', async () => {
    const app = makeApp();
    // User A
    const signupA = await app.request('/api/auth/signup', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'a@test.com', password: 'longenough123' }),
    });
    const cookieA = signupA.headers.get('set-cookie')!.split(';')[0]!;
    await app.request('/api/generate', {
      method: 'POST', headers: { 'content-type': 'application/json', cookie: cookieA, 'x-forwarded-for': '1.1.1.1' },
      body: JSON.stringify(validInputs),
    });
    // User B
    const signupB = await app.request('/api/auth/signup', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'b@test.com', password: 'longenough123' }),
    });
    const cookieB = signupB.headers.get('set-cookie')!.split(';')[0]!;
    const res = await app.request('/api/me/history', { headers: { cookie: cookieB } });
    const body = await res.json();
    expect(body.entries.length).toBe(0);
  });
});
```

- [ ] **Step 2: Implement endpoints**

Edit `/Users/likerun/Desktop/prompt/apps/api/src/routes/me.ts` — add:

```typescript
import { desc, eq, sql } from 'drizzle-orm';

me.get('/api/me/history', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  const limit = Math.min(parseInt(c.req.query('limit') ?? '20', 10), 100);
  const offset = parseInt(c.req.query('offset') ?? '0', 10);

  const rows = await db
    .select({
      id: schema.generations.id,
      createdAt: schema.generations.createdAt,
      promptText: schema.generations.promptText,
      llm: schema.generations.provider,
      model: schema.generations.model,
      mode: schema.generations.mode,
      courseId: schema.generations.courseId,
      rating: schema.feedback.rating,
      ratingText: schema.feedback.text,
    })
    .from(schema.generations)
    .leftJoin(schema.feedback, eq(schema.feedback.generationId, schema.generations.id))
    .where(eq(schema.generations.userId, user.id))
    .orderBy(desc(schema.generations.createdAt))
    .limit(limit)
    .offset(offset);

  const [countRow] = await db
    .select({ c: sql<number>`count(*)::int` })
    .from(schema.generations)
    .where(eq(schema.generations.userId, user.id));
  const total = countRow?.c ?? 0;

  return c.json({
    entries: rows.map((r) => ({
      id: r.id,
      createdAt: r.createdAt.toISOString(),
      promptText: r.promptText,
      llm: r.llm,
      model: r.model,
      mode: r.mode,
      courseId: r.courseId,
      rating: r.rating,
      ratingText: r.ratingText,
    })),
    total,
    hasMore: offset + rows.length < total,
  }, 200);
});

me.get('/api/me/history/:id', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  const id = c.req.param('id');
  const [row] = await db
    .select()
    .from(schema.generations)
    .where(eq(schema.generations.id, id));
  if (!row || row.userId !== user.id) {
    return c.json({ error: 'not found' }, 404);
  }
  return c.json({
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    promptText: row.promptText,
    llm: row.provider,
    model: row.model,
    mode: row.mode,
    courseId: row.courseId,
  }, 200);
});
```

- [ ] **Step 3: Run + commit**

```bash
cd /Users/likerun/Desktop/prompt/apps/api
npm test tests/integration/history-route.test.ts
git add apps/api/src/routes/me.ts apps/api/tests/integration/history-route.test.ts
git commit -m "feat(api): GET /api/me/history with pagination + per-entry detail"
```

---

### Task D3: Frontend history page rewrite

**Files:**
- Modify: `apps/web/app/history/page.tsx`

- [ ] **Step 1: Update history page to prefer server when authed**

Replace `/Users/likerun/Desktop/prompt/apps/web/app/history/page.tsx`:

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { listHistory, rateHistoryEntry, type HistoryEntry } from '@/lib/storage/history';
import { findCourse, STUDY_MODE_LABELS } from '@composed-prompts/shared';
import { useAuth } from '@/lib/use-auth';
import { apiGet } from '@/lib/api-client';
import type { HistoryResponse } from '@composed-prompts/shared';

type DisplayEntry = HistoryEntry & { source: 'local' | 'server' };

export default function HistoryPage() {
  const auth = useAuth();
  const [entries, setEntries] = useState<DisplayEntry[] | null>(null);

  useEffect(() => {
    if (auth.status === 'loading') return;
    if (auth.status === 'authed') {
      apiGet<HistoryResponse>('/api/me/history')
        .then((res) => {
          setEntries(res.entries.map((e) => ({
            id: e.id,
            createdAt: new Date(e.createdAt).getTime(),
            promptText: e.promptText,
            llm: e.llm,
            model: e.model,
            mode: e.mode,
            courseId: e.courseId,
            rating: e.rating ?? undefined,
            ratingText: e.ratingText ?? undefined,
            source: 'server',
          })));
        })
        .catch(() => setEntries([]));
    } else {
      setEntries(listHistory().map((e) => ({ ...e, source: 'local' })));
    }
  }, [auth.status]);

  if (auth.status === 'loading' || entries === null) {
    return <main className="mx-auto max-w-3xl px-6 py-12">Loading…</main>;
  }

  if (entries.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Past prompts</h1>
        <Alert className="mt-4">
          <AlertDescription>
            No saved prompts yet. <Link className="underline" href="/wizard">Generate one</Link>.
            {auth.status === 'anonymous' && (
              <> Sign up to save prompts across devices.</>
            )}
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Past prompts</h1>
      <p className="mt-2 text-sm text-slate-600">
        {auth.status === 'authed'
          ? 'Synced from your account. Available on any device.'
          : 'Stored in this browser only. Sign up to sync across devices.'}
      </p>
      <ul className="mt-6 grid gap-3">
        {entries.map((e) => (
          <HistoryRow key={e.id} entry={e} onRate={(r) => {
            if (e.source === 'local') rateHistoryEntry(e.id, r);
            // (For server entries, rating is done from the result page right after generation;
            // we could add server-side re-rating later but it's not in v1 scope.)
          }} />
        ))}
      </ul>
    </main>
  );
}

function HistoryRow({ entry, onRate }: { entry: DisplayEntry; onRate: (r: 1 | 2 | 3 | 4 | 5) => void }) {
  const [expanded, setExpanded] = useState(false);
  const course = entry.courseId ? findCourse(entry.courseId)?.name : 'Free-text class';
  return (
    <li className="rounded-lg border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-slate-500">{new Date(entry.createdAt).toLocaleString()}</div>
          <div className="font-medium">{course} · {STUDY_MODE_LABELS[entry.mode]}</div>
          <div className="text-xs text-slate-500">{entry.llm} / {entry.model}</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {entry.rating ? (
            <div className="text-yellow-500">{'★'.repeat(entry.rating)}{'☆'.repeat(5 - entry.rating)}</div>
          ) : entry.source === 'local' ? (
            <RatingButtons onRate={onRate} />
          ) : (
            <span className="text-xs text-slate-400">no rating</span>
          )}
        </div>
      </div>
      <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)} className="mt-3">
        {expanded ? 'Hide prompt' : 'Show prompt'}
      </Button>
      {expanded && (
        <pre className="mt-3 whitespace-pre-wrap break-words rounded bg-slate-50 p-3 text-xs font-mono">{entry.promptText}</pre>
      )}
    </li>
  );
}

function RatingButtons({ onRate }: { onRate: (r: 1 | 2 | 3 | 4 | 5) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((r) => (
        <button key={r} type="button" onClick={() => onRate(r as 1 | 2 | 3 | 4 | 5)} className="h-7 w-7 rounded border bg-white text-sm hover:bg-yellow-100">{r}</button>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Build + commit**

```bash
cd /Users/likerun/Desktop/prompt
npm run build --workspace=apps/web
git add apps/web/app/history/page.tsx
git commit -m "feat(web): history page reads from server when authed, localStorage when anon"
```

---

### Task D4: Result page sign-up CTA for anonymous users

**Files:**
- Modify: `apps/web/app/wizard/result/page.tsx`

- [ ] **Step 1: Add CTA block**

In `/Users/likerun/Desktop/prompt/apps/web/app/wizard/result/page.tsx`, after the `<FeedbackForm />` block (or wherever feels natural), add:

```tsx
import Link from 'next/link';
import { useAuth } from '@/lib/use-auth';

// inside the component:
const auth = useAuth();

// in the JSX, before the final close:
{auth.status === 'anonymous' && (
  <div className="mt-6 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
    <p className="text-sm font-medium text-indigo-900">
      Save this prompt and unlock smarter ones over time
    </p>
    <p className="mt-1 text-sm text-indigo-700">
      Sign up to keep your history across devices. The system also starts learning your
      preferences and uses past high-rated prompts to make new ones even better.
    </p>
    <div className="mt-3 flex gap-2">
      <Link href="/signup"><button className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">Sign up</button></Link>
      <Link href="/login"><button className="rounded border border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100">Sign in</button></Link>
    </div>
  </div>
)}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/app/wizard/result/page.tsx
git commit -m "feat(web): result-page sign-up CTA for anonymous users"
```

---

### Task D5: Deploy + verify

**Files:** none (deploy)

- [ ] **Step 1: Deploy**

```bash
cd /Users/likerun/Desktop/prompt
fly deploy -c apps/api/fly.toml --dockerfile apps/api/Dockerfile
git push origin main   # Vercel auto-deploy
```

- [ ] **Step 2: Verify**

In production:
1. Sign up new account
2. Generate a prompt
3. Visit /history → see the entry from the SERVER (not localStorage)
4. Sign out
5. Open /history while anonymous → see localStorage fallback (or empty)
6. Generate as anonymous → result page shows sign-up CTA

**Phase D done.** Server-side history works for authed users.

---

## Phase E — RAG Retrieval

Goal: When generating a prompt, retrieve high-rated past examples (collective + personal) and inject them into the Opus user message. Cold-start safe.

---

### Task E1: RAG retrieval functions (TDD)

**Files:**
- Create: `apps/api/src/lib/rag.ts`, `apps/api/tests/integration/rag.test.ts`

- [ ] **Step 1: Write failing tests**

Create `/Users/likerun/Desktop/prompt/apps/api/tests/integration/rag.test.ts`:

```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { queryCollectiveExamples, queryPersonalExamples, queryPersonalProfile, buildRagContext } from '@/lib/rag';
import { db, schema } from '@/lib/db';
import { resetAllTables } from '../setup';

const seedGen = async (opts: { userId?: string; courseId: string; mode: string; rating?: number; createdAt?: Date }): Promise<string> => {
  const [g] = await db.insert(schema.generations).values({
    userId: opts.userId,
    inputsJson: {},
    promptText: `<interaction_style>style for ${opts.courseId}/${opts.mode}</interaction_style>\n<output_spec>output for ${opts.courseId}</output_spec>`,
    promptHash: 'a'.repeat(64),
    generator: 'opus',
    courseId: opts.courseId,
    mode: opts.mode,
    provider: 'anthropic',
    model: 'claude-opus-4-7',
    ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
  }).returning({ id: schema.generations.id });
  if (opts.rating) {
    await db.insert(schema.feedback).values({
      generationId: g!.id,
      rating: opts.rating,
    });
  }
  return g!.id;
};

const seedUser = async (email: string): Promise<string> => {
  const [u] = await db.insert(schema.users).values({ email, passwordHash: 'x' }).returning({ id: schema.users.id });
  return u!.id;
};

describe('RAG queries', () => {
  beforeEach(async () => {
    await resetAllTables();
  });

  describe('queryCollectiveExamples', () => {
    it('returns top examples for course+mode with rating >= 4', async () => {
      await seedGen({ courseId: 'science-astronomy-ii', mode: 'cram-review', rating: 5 });
      await seedGen({ courseId: 'science-astronomy-ii', mode: 'cram-review', rating: 4 });
      await seedGen({ courseId: 'science-astronomy-ii', mode: 'cram-review', rating: 2 }); // excluded (low rating)
      await seedGen({ courseId: 'science-astronomy-ii', mode: 'practice-questions', rating: 5 }); // excluded (different mode)
      const results = await queryCollectiveExamples({ courseId: 'science-astronomy-ii', mode: 'cram-review', limit: 5 });
      expect(results.length).toBe(2);
      expect(results.every((r) => r.rating >= 4)).toBe(true);
    });

    it('returns empty array when no examples exist (cold start)', async () => {
      const results = await queryCollectiveExamples({ courseId: 'science-astronomy-ii', mode: 'cram-review', limit: 5 });
      expect(results).toEqual([]);
    });
  });

  describe('queryPersonalExamples', () => {
    it('only returns this users high-rated examples', async () => {
      const userA = await seedUser('a@test.com');
      const userB = await seedUser('b@test.com');
      await seedGen({ userId: userA, courseId: 'science-astronomy-ii', mode: 'cram-review', rating: 5 });
      await seedGen({ userId: userB, courseId: 'science-astronomy-ii', mode: 'cram-review', rating: 5 });
      const results = await queryPersonalExamples({ userId: userA, courseId: 'science-astronomy-ii', mode: 'cram-review', limit: 3 });
      expect(results.length).toBe(1);
    });
  });

  describe('queryPersonalProfile', () => {
    it('returns summary when present', async () => {
      const user = await seedUser('u@test.com');
      await db.insert(schema.userProfiles).values({ userId: user, summary: 'Likes rapid quizzes.' });
      const profile = await queryPersonalProfile(user);
      expect(profile).toBe('Likes rapid quizzes.');
    });

    it('returns null when no profile', async () => {
      const user = await seedUser('u@test.com');
      const profile = await queryPersonalProfile(user);
      expect(profile).toBeNull();
    });
  });

  describe('buildRagContext', () => {
    it('returns empty string when all retrievals are empty', () => {
      const ctx = buildRagContext({ collective: [], personal: [], profile: null });
      expect(ctx).toBe('');
    });

    it('includes profile when present', () => {
      const ctx = buildRagContext({
        collective: [],
        personal: [],
        profile: 'Likes rapid quizzes.',
      });
      expect(ctx).toContain('Personal style notes');
      expect(ctx).toContain('Likes rapid quizzes.');
    });

    it('includes collective examples', () => {
      const ctx = buildRagContext({
        collective: [{ promptText: '<interaction_style>collab</interaction_style>', rating: 5 }],
        personal: [],
        profile: null,
      });
      expect(ctx).toContain('What worked for OTHER students');
      expect(ctx).toContain('collab');
    });

    it('includes personal example', () => {
      const ctx = buildRagContext({
        collective: [],
        personal: [{ promptText: '<interaction_style>my style</interaction_style>', rating: 5 }],
        profile: null,
      });
      expect(ctx).toContain('What worked for THIS student');
      expect(ctx).toContain('my style');
    });
  });
});
```

- [ ] **Step 2: Implement**

Create `/Users/likerun/Desktop/prompt/apps/api/src/lib/rag.ts`:

```typescript
import { db, schema } from './db';
import { and, eq, gte, desc, sql } from 'drizzle-orm';

export type RagExample = {
  promptText: string;
  rating: number;
};

export type RagContext = {
  collective: RagExample[];
  personal: RagExample[];
  profile: string | null;
};

const extractKeySections = (promptText: string): string => {
  // Extract just <interaction_style> + <output_spec> from the prompt (XML format)
  // Also handle markdown (## INTERACTION_STYLE / ## OUTPUT_SPEC)
  // and numbered (Step N — INTERACTION_STYLE:) for completeness
  const sections: string[] = [];
  const xmlInter = promptText.match(/<interaction_style>([\s\S]*?)<\/interaction_style>/);
  if (xmlInter) sections.push(xmlInter[0]!);
  const xmlOut = promptText.match(/<output_spec>([\s\S]*?)<\/output_spec>/);
  if (xmlOut) sections.push(xmlOut[0]!);
  if (sections.length) return sections.join('\n\n');

  const mdInter = promptText.match(/## INTERACTION_STYLE[\s\S]*?(?=\n\n## |\nStep \d|$)/);
  if (mdInter) sections.push(mdInter[0]!);
  const mdOut = promptText.match(/## OUTPUT_SPEC[\s\S]*?(?=\n\n## |\nStep \d|$)/);
  if (mdOut) sections.push(mdOut[0]!);
  if (sections.length) return sections.join('\n\n');

  // Fallback: take first 1000 chars
  return promptText.slice(0, 1000);
};

export async function queryCollectiveExamples(opts: {
  courseId: string | null;
  mode: string;
  limit: number;
}): Promise<RagExample[]> {
  if (!opts.courseId) return [];
  const rows = await db
    .select({
      promptText: schema.generations.promptText,
      rating: schema.feedback.rating,
    })
    .from(schema.generations)
    .innerJoin(schema.feedback, eq(schema.feedback.generationId, schema.generations.id))
    .where(
      and(
        eq(schema.generations.courseId, opts.courseId),
        eq(schema.generations.mode, opts.mode),
        gte(schema.feedback.rating, 4),
      ),
    )
    .orderBy(desc(schema.feedback.rating), desc(schema.generations.createdAt))
    .limit(opts.limit);
  return rows.map((r) => ({ promptText: extractKeySections(r.promptText), rating: r.rating }));
}

export async function queryPersonalExamples(opts: {
  userId: string;
  courseId: string | null;
  mode: string;
  limit: number;
}): Promise<RagExample[]> {
  if (!opts.courseId) return [];
  const rows = await db
    .select({
      promptText: schema.generations.promptText,
      rating: schema.feedback.rating,
    })
    .from(schema.generations)
    .innerJoin(schema.feedback, eq(schema.feedback.generationId, schema.generations.id))
    .where(
      and(
        eq(schema.generations.userId, opts.userId),
        eq(schema.generations.courseId, opts.courseId),
        eq(schema.generations.mode, opts.mode),
        gte(schema.feedback.rating, 4),
      ),
    )
    .orderBy(desc(schema.feedback.rating), desc(schema.generations.createdAt))
    .limit(opts.limit);
  return rows.map((r) => ({ promptText: extractKeySections(r.promptText), rating: r.rating }));
}

export async function queryPersonalProfile(userId: string): Promise<string | null> {
  const [row] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, userId));
  return row?.summary ?? null;
}

export function buildRagContext(ctx: RagContext): string {
  const blocks: string[] = [];
  if (ctx.profile) {
    blocks.push(`Personal style notes:\n${ctx.profile}`);
  }
  if (ctx.personal.length > 0) {
    const examples = ctx.personal.map((e) => `- ${e.promptText}`).join('\n');
    blocks.push(`What worked for THIS student previously:\n${examples}`);
  }
  if (ctx.collective.length > 0) {
    const examples = ctx.collective.map((e) => `- ${e.promptText}`).join('\n');
    blocks.push(`What worked for OTHER students in this exact course + mode:\n${examples}`);
  }
  if (blocks.length === 0) return '';
  return [
    '---',
    'Context from past generations that scored well:',
    '',
    ...blocks,
    '',
    "Adapt these — don't copy them. Match the spirit of what worked, not the literal wording.",
  ].join('\n');
}

export async function fetchRagContext(opts: {
  userId: string | null;
  courseId: string | null;
  mode: string;
}): Promise<RagContext> {
  const [collective, personal, profile] = await Promise.all([
    queryCollectiveExamples({ courseId: opts.courseId, mode: opts.mode, limit: 2 }),
    opts.userId
      ? queryPersonalExamples({ userId: opts.userId, courseId: opts.courseId, mode: opts.mode, limit: 1 })
      : Promise.resolve([]),
    opts.userId ? queryPersonalProfile(opts.userId) : Promise.resolve(null),
  ]);
  return { collective, personal, profile };
}
```

- [ ] **Step 3: Run + commit**

```bash
cd /Users/likerun/Desktop/prompt/apps/api
npm test tests/integration/rag.test.ts
git add apps/api/src/lib/rag.ts apps/api/tests/integration/rag.test.ts
git commit -m "feat(api): RAG retrieval functions + buildRagContext"
```

---

### Task E2: Modify Opus full-prompt module to accept RAG context

**Files:**
- Modify: `packages/shared/src/generation/opus-full-prompt.ts`
- Modify: `apps/api/src/lib/pipeline.ts`

- [ ] **Step 1: Extend the Opus function signature**

Edit `/Users/likerun/Desktop/prompt/packages/shared/src/generation/opus-full-prompt.ts`. Find the existing `generateFullPromptWithOpus` function and extend it to accept an optional second param:

```typescript
export async function generateFullPromptWithOpus(
  inputs: WizardInputs,
  ragContext: string = '',
): Promise<OpusFullPromptResult> {
  // ... existing setup ...

  // Replace the existing buildUserMessage call:
  const userMessage = buildUserMessage(inputs) + (ragContext ? `\n\n${ragContext}` : '');

  // ... use userMessage in the messages array
}
```

(The `ragContext` is appended to the existing user message so the prompt-cache key — the system prompt — remains stable.)

- [ ] **Step 2: Update pipeline to fetch + pass RAG context**

Edit `/Users/likerun/Desktop/prompt/apps/api/src/lib/pipeline.ts`:

```typescript
import { fetchRagContext, buildRagContext } from './rag';

export async function runPipeline(
  inputs: WizardInputs,
  opts: { userId: string | null } = { userId: null },
): Promise<PipelineResult> {
  const budgetOk = await budgetAvailable();
  let fallbackReason: PipelineResult['fallbackReason'];

  if (budgetOk) {
    const rag = await fetchRagContext({ userId: opts.userId, courseId: inputs.courseId, mode: inputs.mode });
    const ragText = buildRagContext(rag);
    const result = await generateFullPromptWithOpus(inputs, ragText);
    if (result.ok) {
      await recordSpend(estimateOpusSpendUsd(result.usage));
      return {
        prompt: result.prompt,
        promptHash: promptHash(result.prompt),
        generator: 'opus',
      };
    }
    fallbackReason = 'api-error';
  } else {
    fallbackReason = 'budget-exhausted';
  }

  const prompt = assembleDeterministicPrompt(inputs);
  return {
    prompt,
    promptHash: promptHash(prompt),
    generator: 'deterministic',
    fallbackReason,
  };
}
```

- [ ] **Step 3: Update generate route to pass user_id**

Edit `/Users/likerun/Desktop/prompt/apps/api/src/routes/generate.ts` — change the `runPipeline(inputs)` call to:

```typescript
const userId = c.get('user')?.id ?? null;
const result = await runPipeline(inputs, { userId });
```

- [ ] **Step 4: Run all tests**

```bash
cd /Users/likerun/Desktop/prompt/apps/api
npm test
```

Expected: all tests pass. Update the pipeline.test.ts mock if needed — it should mock `fetchRagContext` to return empty arrays, OR the existing test setup already handles it because runPipeline still works when RAG returns empty.

Actually, the existing `pipeline.test.ts` will need an update — `generateFullPromptWithOpus` now takes 2 args. Update the mock invocation expectations if any.

If the pipeline test passes without changes, great. If not:

```typescript
// In pipeline.test.ts, add to vi.hoisted block:
const { mockFetchRagContext } = vi.hoisted(() => ({ mockFetchRagContext: vi.fn() }));
vi.mock('@/lib/rag', () => ({
  fetchRagContext: mockFetchRagContext,
  buildRagContext: () => '',
}));
// In beforeEach:
mockFetchRagContext.mockResolvedValue({ collective: [], personal: [], profile: null });
```

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/generation/opus-full-prompt.ts apps/api/src/lib/pipeline.ts apps/api/src/routes/generate.ts apps/api/tests/unit/pipeline.test.ts
git commit -m "feat: wire RAG context into Opus full-prompt + pipeline"
```

---

### Task E3: Deploy + verify RAG works end-to-end

**Files:** none

- [ ] **Step 1: Deploy**

```bash
cd /Users/likerun/Desktop/prompt
fly deploy -c apps/api/fly.toml --dockerfile apps/api/Dockerfile
```

- [ ] **Step 2: Verify cold-start**

On a clean course/mode (one no one has generated for yet), generate a prompt. Should work normally — empty RAG context.

- [ ] **Step 3: Seed RAG + verify warm path**

1. Generate a prompt for science-astronomy-ii / cram-review
2. Rate it 5
3. Generate ANOTHER prompt with the same course + mode
4. Open the new prompt — the Opus output should reflect the patterns from the rated one

Check Fly logs to confirm RAG queries are running (no errors).

**Phase E done.** RAG retrieval is live.

---

## Phase F — Personal Profile Job

Goal: A scheduled background job updates each user's profile summary every 4 hours based on their feedback history. The summary is then injected into RAG context for that user's future generations.

---

### Task F1: Profile update job (TDD)

**Files:**
- Create: `apps/api/src/jobs/update-profiles.ts`, `apps/api/tests/integration/update-profiles.test.ts`

- [ ] **Step 1: Write failing test**

Create `/Users/likerun/Desktop/prompt/apps/api/tests/integration/update-profiles.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { updateAllProfiles, MIN_RATED_GENERATIONS } from '@/jobs/update-profiles';
import { db, schema } from '@/lib/db';
import { resetAllTables } from '../setup';

const mockGenerateSummary = vi.fn();
vi.mock('@/jobs/update-profiles', async (importActual) => {
  const actual: any = await importActual();
  return { ...actual, generateSummary: mockGenerateSummary };
});

// Hmm — we can't easily mock an internal function this way. Better: extract summarize() into its own module.
// For simplicity here, we'll just verify the DB side: that profiles are upserted for users meeting the threshold.

describe('updateAllProfiles', () => {
  beforeEach(async () => {
    await resetAllTables();
    mockGenerateSummary.mockReset();
  });

  it('skips users with fewer than MIN_RATED_GENERATIONS rated generations', async () => {
    const [user] = await db.insert(schema.users).values({ email: 'u@test.com', passwordHash: 'x' }).returning({ id: schema.users.id });
    // Seed 2 rated generations (below threshold of 5)
    for (let i = 0; i < 2; i++) {
      const [g] = await db.insert(schema.generations).values({
        userId: user!.id, inputsJson: {}, promptText: 'p', promptHash: 'a'.repeat(64),
        generator: 'opus', mode: 'cram-review', provider: 'anthropic', model: 'claude-opus-4-7',
      }).returning({ id: schema.generations.id });
      await db.insert(schema.feedback).values({ generationId: g!.id, rating: 4 });
    }
    await updateAllProfiles({ summarizeFn: vi.fn().mockResolvedValue('summary text') });
    const profiles = await db.select().from(schema.userProfiles);
    expect(profiles.length).toBe(0);
  });

  it('creates profile for user with >= MIN_RATED_GENERATIONS', async () => {
    const [user] = await db.insert(schema.users).values({ email: 'u@test.com', passwordHash: 'x' }).returning({ id: schema.users.id });
    for (let i = 0; i < MIN_RATED_GENERATIONS; i++) {
      const [g] = await db.insert(schema.generations).values({
        userId: user!.id, inputsJson: {}, promptText: `p${i}`, promptHash: 'a'.repeat(64),
        generator: 'opus', mode: 'cram-review', provider: 'anthropic', model: 'claude-opus-4-7',
      }).returning({ id: schema.generations.id });
      await db.insert(schema.feedback).values({ generationId: g!.id, rating: 4, text: `comment ${i}` });
    }
    const summarizeFn = vi.fn().mockResolvedValue('This student prefers brief quizzes.');
    await updateAllProfiles({ summarizeFn });
    expect(summarizeFn).toHaveBeenCalledTimes(1);
    const profiles = await db.select().from(schema.userProfiles);
    expect(profiles.length).toBe(1);
    expect(profiles[0]!.summary).toBe('This student prefers brief quizzes.');
  });
});
```

- [ ] **Step 2: Implement**

Create `/Users/likerun/Desktop/prompt/apps/api/src/jobs/update-profiles.ts`:

```typescript
import Anthropic from '@anthropic-ai/sdk';
import { db, schema } from '@/lib/db';
import { eq, sql, desc, gte } from 'drizzle-orm';

export const MIN_RATED_GENERATIONS = 5;
const LOOKBACK_DAYS = 30;

type SummarizeFn = (inputs: { ratedSamples: Array<{ rating: number; text: string | null; prompt: string }> }) => Promise<string>;

const defaultSummarize: SummarizeFn = async ({ ratedSamples }) => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const samples = ratedSamples.map((s) =>
    `Rating: ${s.rating}/5\nComment: ${s.text ?? '(none)'}\nPrompt excerpt: ${s.prompt.slice(0, 800)}`
  ).join('\n\n---\n\n');
  const response = await client.messages.create({
    model: 'claude-opus-4-7',
    max_tokens: 400,
    system: 'You analyze a student\'s ratings + comments on study prompts to produce a single-paragraph (3-5 sentences) summary of their preferences. Be concrete and specific. Focus on actionable patterns (preferred style, length, depth, types of activities). Output only the summary paragraph, no preamble.',
    messages: [{ role: 'user', content: samples }],
  });
  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('no text block');
  return block.text.trim();
};

export async function updateAllProfiles(opts: { summarizeFn?: SummarizeFn } = {}): Promise<void> {
  const summarizeFn = opts.summarizeFn ?? defaultSummarize;
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Find users with enough rated generations
  const eligibleUsers = await db
    .select({
      userId: schema.generations.userId,
      ratedCount: sql<number>`count(${schema.feedback.id})::int`,
    })
    .from(schema.generations)
    .innerJoin(schema.feedback, eq(schema.feedback.generationId, schema.generations.id))
    .where(gte(schema.generations.createdAt, cutoff))
    .groupBy(schema.generations.userId)
    .having(sql`count(${schema.feedback.id}) >= ${MIN_RATED_GENERATIONS}`);

  for (const eligible of eligibleUsers) {
    if (!eligible.userId) continue;
    const samples = await db
      .select({
        rating: schema.feedback.rating,
        text: schema.feedback.text,
        prompt: schema.generations.promptText,
      })
      .from(schema.generations)
      .innerJoin(schema.feedback, eq(schema.feedback.generationId, schema.generations.id))
      .where(eq(schema.generations.userId, eligible.userId))
      .orderBy(desc(schema.generations.createdAt))
      .limit(30);

    try {
      const summary = await summarizeFn({ ratedSamples: samples });
      await db
        .insert(schema.userProfiles)
        .values({ userId: eligible.userId, summary })
        .onConflictDoUpdate({
          target: schema.userProfiles.userId,
          set: { summary, updatedAt: sql`now()` },
        });
      console.log(`[update-profiles] updated profile for user ${eligible.userId}`);
    } catch (err) {
      console.error(`[update-profiles] failed for user ${eligible.userId}`, { message: err instanceof Error ? err.message : String(err) });
    }
  }
}

// Entry point when run as a script
if (import.meta.url === `file://${process.argv[1]}`) {
  await import('dotenv/config');
  await updateAllProfiles();
  process.exit(0);
}
```

- [ ] **Step 3: Run + commit**

```bash
cd /Users/likerun/Desktop/prompt/apps/api
npm test tests/integration/update-profiles.test.ts
git add apps/api/src/jobs/update-profiles.ts apps/api/tests/integration/update-profiles.test.ts
git commit -m "feat(api): scheduled job to update user profiles from feedback"
```

---

### Task F2: Fly.io scheduled machine for the job

**Files:**
- Create: `apps/api/Dockerfile.job`, `apps/api/fly.job.toml`

- [ ] **Step 1: Job Dockerfile**

Create `/Users/likerun/Desktop/prompt/apps/api/Dockerfile.job`:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json tsconfig.base.json ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/api/package.json ./apps/api/

RUN npm install --workspaces --include-workspace-root --no-audit --no-fund

COPY packages/shared/ ./packages/shared/
COPY apps/api/ ./apps/api/

RUN npm run build --workspace=apps/api

FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY --from=builder /app/package.json /app/package-lock.json /app/tsconfig.base.json ./
COPY --from=builder /app/packages/shared ./packages/shared
COPY --from=builder /app/apps/api/package.json ./apps/api/
COPY --from=builder /app/apps/api/dist ./apps/api/dist

RUN npm install --workspaces --include-workspace-root --omit=dev --no-audit --no-fund

CMD ["node", "apps/api/dist/jobs/update-profiles.js"]
```

- [ ] **Step 2: fly.job.toml**

Create `/Users/likerun/Desktop/prompt/apps/api/fly.job.toml`:

```toml
app = "composed-prompts-jobs"
primary_region = "iad"

[build]
  dockerfile = "apps/api/Dockerfile.job"

[[vm]]
  size = "shared-cpu-1x"
  memory = "256mb"

[deploy]
  release_command = "node -e 'console.log(\"release ok\")'"

[env]
  NODE_ENV = "production"
```

- [ ] **Step 3: Create the second Fly app**

```bash
cd /Users/likerun/Desktop/prompt
fly apps create composed-prompts-jobs
fly secrets set ANTHROPIC_API_KEY="$(fly secrets list -a composed-prompts-api --json | jq -r '.[] | select(.Name == "ANTHROPIC_API_KEY") | .Digest')" \
                 DATABASE_URL="$(grep ^DATABASE_URL apps/api/.env | cut -d= -f2-)" \
                 -a composed-prompts-jobs
```

Wait — `secrets list` doesn't return values, only digests. So we have to set them fresh:

```bash
fly secrets set ANTHROPIC_API_KEY="$(grep ^ANTHROPIC_API_KEY apps/api/.env | cut -d= -f2-)" \
                 DATABASE_URL="$(grep ^DATABASE_URL apps/api/.env | cut -d= -f2-)" \
                 -a composed-prompts-jobs
```

- [ ] **Step 4: Deploy the job image**

```bash
fly deploy -c apps/api/fly.job.toml --dockerfile apps/api/Dockerfile.job -a composed-prompts-jobs --build-only --image-label cron
```

(`--build-only` because we don't want it to start a long-running machine. We'll invoke it via `fly machine run` from a cron.)

- [ ] **Step 5: Set up Fly cron via flycast (or use fly machine run via GitHub Actions cron)**

Fly.io has built-in scheduled machines. Use them:

```bash
# Create a scheduled machine that runs every 4h
fly machine run registry.fly.io/composed-prompts-jobs:latest \
  --schedule "every 4 hours" \
  -a composed-prompts-jobs \
  --region iad \
  --vm-memory 256
```

This creates a Fly Machine that auto-starts on schedule, runs the CMD (the update-profiles script), exits.

If `--schedule` flag isn't supported in this flyctl version, fall back to GitHub Actions cron triggering `fly machine run`:

```yaml
# .github/workflows/profile-cron.yml
name: Update profiles cron
on:
  schedule:
    - cron: '0 */4 * * *'  # every 4h
jobs:
  run:
    runs-on: ubuntu-latest
    steps:
      - uses: superfly/flyctl-actions/setup-flyctl@master
      - run: flyctl machine run registry.fly.io/composed-prompts-jobs:latest -a composed-prompts-jobs --rm
        env:
          FLY_API_TOKEN: ${{ secrets.FLY_API_TOKEN }}
```

(User adds `FLY_API_TOKEN` to GitHub repo secrets. Get a token via `fly tokens create deploy`.)

- [ ] **Step 6: Verify job runs once manually**

```bash
fly machine run registry.fly.io/composed-prompts-jobs:latest -a composed-prompts-jobs --rm
fly logs -a composed-prompts-jobs
```

Expected: prints "[update-profiles] updated profile for user ..." for any users meeting the threshold, then exits.

- [ ] **Step 7: Commit**

```bash
cd /Users/likerun/Desktop/prompt
git add apps/api/Dockerfile.job apps/api/fly.job.toml
git commit -m "feat(api): Fly.io scheduled job for profile updates (every 4h)"
git push origin main
```

**Phase F done.** Personal profiles get computed periodically and feed into RAG retrieval.

---

## Final Verification + Cleanup

### Task Z1: Full system check

- [ ] All Phase A-F tests pass:
  ```bash
  npm run test
  ```
- [ ] Frontend builds + deploys via Vercel
- [ ] Backend deploys to Fly
- [ ] Job runs successfully
- [ ] End-to-end UX walkthrough:
  1. Visit landing page → looks right
  2. Sign up → succeed → land on /account
  3. Generate a prompt → composing screen → result
  4. Rate the prompt
  5. Visit /history → see it
  6. Sign out → sign back in → /history still shows it
  7. Generate another prompt for the same course/mode → check Fly logs to confirm RAG retrieval happened (the second prompt should reference patterns from the rated first)
  8. Manually trigger the profile job → check user_profiles table → summary appears

### Task Z2: README updates

- [ ] Update `apps/web/README.md` to describe the new architecture
- [ ] Create `apps/api/README.md` with: local dev setup, env vars, deploy commands
- [ ] Create root `README.md` with monorepo overview + links

---

**Done.** The Pomfret Prompt Generator now has:
- A separate Hono backend on Fly.io (no Vercel timeout risk)
- User accounts with Lucia auth (optional)
- Server-side history for authed users
- RAG-powered learning that improves prompts over time
- Per-user preference profiles computed every 4 hours

The system gets measurably smarter as feedback accumulates. Cold-start works fine. Anonymous use still works. Cost is comparable to before.
