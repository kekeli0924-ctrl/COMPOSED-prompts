# Gmail (Google) Sign-in via Clerk — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the custom Lucia email/password auth with Clerk as the managed identity provider, giving users Google sign-in plus email/password through Clerk's themed widgets.

**Architecture:** Clerk owns auth + sessions on the Next.js frontend. The frontend sends a short-lived Clerk JWT as `Authorization: Bearer` to the Hono backend, which verifies it with `@clerk/backend` and just-in-time provisions a local `users` row mapped to existing `uuid` foreign keys. The `/api/*` → Fly proxy stays; no cookies in the API path.

**Tech Stack:** Clerk (`@clerk/nextjs`, `@clerk/backend`), Next.js 14 App Router, Hono, Drizzle + Postgres, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-28-gmail-signin-design.md`

---

## File map

**Create:**
- `apps/api/src/lib/clerk.ts` — Clerk backend client
- `apps/api/src/lib/users.ts` — `getOrCreateUser` JIT provisioning
- `apps/api/src/middleware/clerk-auth.ts` — Bearer-token verification middleware
- `apps/api/scripts/reset-for-clerk.ts` — one-off data clear before migration
- `apps/api/tests/helpers/with-user.ts` — test middleware that injects a user
- `apps/api/tests/integration/users.test.ts` — `getOrCreateUser` tests
- `apps/web/middleware.ts` — Clerk Next.js middleware (excludes `/api/*`)
- `apps/web/app/sign-in/[[...sign-in]]/page.tsx` — `<SignIn />`
- `apps/web/app/sign-up/[[...sign-up]]/page.tsx` — `<SignUp />`
- `apps/web/lib/use-api.ts` — `useApi()` hook (token-injecting fetch wrappers)

**Modify:**
- `apps/api/src/schema.ts` — add `clerk_user_id`, drop `password_hash` + `sessions`
- `apps/api/src/index.ts` — swap middleware, drop auth-route mount
- `apps/api/src/routes/me.ts` — unchanged logic (reads `user` from new middleware) — no edit needed but verify
- `apps/api/package.json` — deps
- `apps/api/tests/setup.ts` — drop `sessions` delete
- `apps/api/tests/integration/{generate-route,history-route,me-route,rag,update-profiles}.test.ts` — reseed/restub
- `apps/web/app/layout.tsx` — `<ClerkProvider>`
- `apps/web/lib/api-client.ts` — optional Bearer token
- `apps/web/components/ShowcaseHeader.tsx` — Clerk components
- `apps/web/app/account/page.tsx` — `useUser` + `useApi`
- `apps/web/app/history/page.tsx` — `useUser` + `useApi`
- `apps/web/app/wizard/page.tsx` — `useApi`
- `apps/web/app/wizard/result/page.tsx` — `<SignedOut>` CTA
- `apps/web/components/FeedbackForm.tsx` — `useApi`
- `apps/web/package.json` — deps

**Delete:**
- `apps/api/src/routes/auth.ts`, `apps/api/src/lib/auth.ts`, `apps/api/src/middleware/session.ts`
- `apps/api/tests/integration/auth-routes.test.ts`
- `apps/web/app/login/`, `apps/web/app/signup/`, `apps/web/components/auth/AuthForm.tsx`, `apps/web/lib/use-auth.ts`

---

## Task 1: [USER ACTION] Create Clerk application + local env

No code. This must happen first so every later dev/test/build step has keys.

- [ ] **Step 1: Create the Clerk app**

Go to https://dashboard.clerk.com → create application "Composed". Under **User & Authentication → Email, Phone, Username**, enable **Email**. Under **SSO Connections / Social Connections**, enable **Google** (dev uses Clerk's shared Google credentials — no Google Cloud setup needed yet).

- [ ] **Step 2: Set account linking**

In Clerk dashboard → **Configure → Account linking** (or User & Authentication → Account linking), enable **"Link accounts with the same verified email address."**

- [ ] **Step 3: Copy keys**

From **API Keys**, copy the **Publishable key** (`pk_test_…`) and **Secret key** (`sk_test_…`).

- [ ] **Step 4: Backend local env**

Add to `apps/api/.env` (gitignored):
```
CLERK_SECRET_KEY=sk_test_xxx
```

- [ ] **Step 5: Frontend local env**

Add to `apps/web/.env.local` (gitignored):
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_xxx
CLERK_SECRET_KEY=sk_test_xxx
NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in
NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up
NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/account
NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/account
```

No commit (env files are gitignored). Confirm with: `grep -c CLERK apps/api/.env apps/web/.env.local`.

---

## Task 2: Backend dependencies

**Files:** Modify `apps/api/package.json`

- [ ] **Step 1: Edit dependencies**

In `apps/api/package.json`, remove from `dependencies`:
```
"lucia": "^3.2.0",
"@lucia-auth/adapter-drizzle": "^1.1.0",
"bcryptjs": "^2.4.3",
```
Add to `dependencies`:
```
"@clerk/backend": "^1.21.0",
```
Remove from `devDependencies`:
```
"@types/bcryptjs": "^2.4.6",
```

- [ ] **Step 2: Install**

Run: `npm install --workspaces --include-workspace-root --no-audit --no-fund`
Expected: completes; `@clerk/backend` present, lucia/bcryptjs gone.

- [ ] **Step 3: Verify**

Run: `grep -E "@clerk/backend|lucia|bcryptjs" apps/api/package.json`
Expected: only `@clerk/backend` appears.

- [ ] **Step 4: Commit**

```bash
git add apps/api/package.json package-lock.json
git commit -m "build(api): swap lucia/bcryptjs deps for @clerk/backend"
```

---

## Task 3: Schema migration — add clerk_user_id, drop password_hash + sessions

**Files:** Modify `apps/api/src/schema.ts`; Create `apps/api/scripts/reset-for-clerk.ts`; Modify `apps/api/tests/setup.ts`, `apps/api/tests/integration/rag.test.ts`, `apps/api/tests/integration/update-profiles.test.ts`

**IMPORTANT — two separate migrations to avoid an interactive prompt.** `drizzle-kit generate` asks an arrow-key "is this a rename?" question when a column is added AND dropped in the same diff. A non-interactive shell can't answer it. So we generate the DROP and the ADD as two separate, unambiguous migrations.

- [ ] **Step 1: Edit schema — remove `password_hash` and the `sessions` table (do NOT add `clerk_user_id` yet)**

In `apps/api/src/schema.ts`, replace the `users` definition and delete the entire `sessions` definition.

Replace:
```typescript
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
```
With (note: NO `clerk_user_id` yet — that's added in Step 3):
```typescript
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

(`index` stays imported — generations/rate_limit_log still use it.)

- [ ] **Step 2: Generate the DROP migration (non-interactive — pure drops)**

Run: `cd apps/api && npm run db:generate`
This diff only drops a column and a table (no additions), so drizzle-kit does NOT prompt for a rename.
Expected: new file `apps/api/drizzle/0002_*.sql` containing `DROP COLUMN "password_hash"` and `DROP TABLE "sessions"` (with cascade). If the command appears to hang waiting for input, press Ctrl-C and report BLOCKED — the schema edit in Step 1 likely still had an added column.

- [ ] **Step 3: Edit schema — now ADD `clerk_user_id`**

In `apps/api/src/schema.ts`, add `clerkUserId` to the `users` table so it becomes:
```typescript
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 4: Generate the ADD migration (non-interactive — pure add)**

Run: `cd apps/api && npm run db:generate`
This diff only adds a column (nothing dropped), so no rename prompt.
Expected: new file `apps/api/drizzle/0003_*.sql` containing `ADD COLUMN "clerk_user_id" text NOT NULL` and a UNIQUE constraint.

- [ ] **Step 5: Create the data-clear script**

Create `apps/api/scripts/reset-for-clerk.ts`:
```typescript
import 'dotenv/config';
import { sql } from 'drizzle-orm';
import { db } from '../src/lib/db.js';

// All existing users/generations are throwaway test data. Clearing the users
// table (cascading to generations/feedback/user_profiles/sessions) lets the
// new NOT NULL clerk_user_id column be added to an empty table.
await db.execute(sql`TRUNCATE users CASCADE`);
console.log('cleared users (cascade) for Clerk migration');
process.exit(0);
```

- [ ] **Step 6: Clear data, then apply both migrations**

```bash
cd apps/api
npx tsx scripts/reset-for-clerk.ts
npm run db:migrate
```
Expected: script prints "cleared users…"; migrate applies 0002 (drop password_hash + sessions) then 0003 (add clerk_user_id NOT NULL) with no "column contains null values" error (users table is empty). NOTE: this runs against the live Neon DB in `apps/api/.env` — the user has authorized this (production auth breaks until the new backend deploys; anonymous generation keeps working).

- [ ] **Step 7: Review the generated SQL**

Read both `apps/api/drizzle/0002_*.sql` and `0003_*.sql` and confirm they match the intent (drop password_hash + sessions; add clerk_user_id NOT NULL unique). Neither should contain a RENAME.

- [ ] **Step 8: Fix `tests/setup.ts`**

In `apps/api/tests/setup.ts`, remove the sessions line:
```typescript
  await db.delete(schema.sessions);
```
(Leave the others.)

- [ ] **Step 9: Fix test seeds that set `passwordHash`**

In `apps/api/tests/integration/rag.test.ts`, the `seedUser` helper:
```typescript
const [u] = await db.insert(schema.users).values({ email, passwordHash: 'x' }).returning({ id: schema.users.id });
```
becomes:
```typescript
const [u] = await db.insert(schema.users).values({ email, clerkUserId: `clerk_${email}` }).returning({ id: schema.users.id });
```

In `apps/api/tests/integration/update-profiles.test.ts`, both inserts:
```typescript
.values({ email: 'u@test.com', passwordHash: 'x' })
```
become:
```typescript
.values({ email: 'u@test.com', clerkUserId: `clerk_${Math.random()}` })
```
(Each user needs a unique `clerk_user_id`; both tests reset tables in `beforeEach`, but use a unique value to be safe.)

- [ ] **Step 10: Commit**

```bash
git add apps/api/src/schema.ts apps/api/drizzle apps/api/scripts/reset-for-clerk.ts apps/api/tests/setup.ts apps/api/tests/integration/rag.test.ts apps/api/tests/integration/update-profiles.test.ts
git commit -m "feat(api): schema migration to Clerk identity (clerk_user_id; drop password_hash + sessions)"
```

---

## Task 4: `getOrCreateUser` JIT provisioning (TDD)

**Files:** Create `apps/api/src/lib/users.ts`, `apps/api/tests/integration/users.test.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/integration/users.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getOrCreateUser } from '@/lib/users';
import { db, schema } from '@/lib/db';
import { resetAllTables } from '../setup';

describe('getOrCreateUser', () => {
  beforeEach(async () => {
    await resetAllTables();
  });

  it('creates a user once and is idempotent', async () => {
    const fetchProfile = vi.fn().mockResolvedValue({ email: 'u@test.com', displayName: 'U' });
    const a = await getOrCreateUser('clerk_1', fetchProfile);
    const b = await getOrCreateUser('clerk_1', fetchProfile);
    expect(a.id).toBe(b.id);
    expect(a.email).toBe('u@test.com');
    expect(fetchProfile).toHaveBeenCalledTimes(1); // not called on cache hit
    const rows = await db.select().from(schema.users);
    expect(rows.length).toBe(1);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd apps/api && npm test -- tests/integration/users.test.ts`
Expected: FAIL — cannot find module `@/lib/users`.

- [ ] **Step 3: Implement**

Create `apps/api/src/lib/users.ts`:
```typescript
import { eq } from 'drizzle-orm';
import { db, schema } from './db.js';

export type LocalUser = {
  id: string;
  email: string;
  displayName: string | null;
  clerkUserId: string;
};

const cols = {
  id: schema.users.id,
  email: schema.users.email,
  displayName: schema.users.displayName,
  clerkUserId: schema.users.clerkUserId,
};

export async function getOrCreateUser(
  clerkUserId: string,
  fetchProfile: () => Promise<{ email: string; displayName: string | null }>,
): Promise<LocalUser> {
  const [existing] = await db.select(cols).from(schema.users).where(eq(schema.users.clerkUserId, clerkUserId));
  if (existing) return existing;

  const profile = await fetchProfile();
  const [created] = await db
    .insert(schema.users)
    .values({ clerkUserId, email: profile.email, displayName: profile.displayName })
    .onConflictDoNothing({ target: schema.users.clerkUserId })
    .returning(cols);
  if (created) return created;

  // Race: another concurrent request inserted between our select and insert.
  const [raced] = await db.select(cols).from(schema.users).where(eq(schema.users.clerkUserId, clerkUserId));
  return raced!;
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `cd apps/api && npm test -- tests/integration/users.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/users.ts apps/api/tests/integration/users.test.ts
git commit -m "feat(api): getOrCreateUser JIT provisioning keyed on clerk_user_id"
```

---

## Task 5: Clerk backend client

**Files:** Create `apps/api/src/lib/clerk.ts`

- [ ] **Step 1: Implement**

Create `apps/api/src/lib/clerk.ts`:
```typescript
import { createClerkClient } from '@clerk/backend';

const secretKey = process.env.CLERK_SECRET_KEY;
if (!secretKey) {
  throw new Error('CLERK_SECRET_KEY is required');
}

export const clerkClient = createClerkClient({ secretKey });
```

- [ ] **Step 2: Type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors. (If `createClerkClient` is not found, confirm `@clerk/backend` installed in Task 2.)

- [ ] **Step 3: Commit**

```bash
git add apps/api/src/lib/clerk.ts
git commit -m "feat(api): Clerk backend client"
```

---

## Task 6: Clerk auth middleware + wire-up + delete Lucia

**Files:** Create `apps/api/src/middleware/clerk-auth.ts`; Modify `apps/api/src/index.ts`; Delete `apps/api/src/routes/auth.ts`, `apps/api/src/lib/auth.ts`, `apps/api/src/middleware/session.ts`

- [ ] **Step 1: Create the middleware**

Create `apps/api/src/middleware/clerk-auth.ts`:
```typescript
import type { MiddlewareHandler } from 'hono';
import { verifyToken } from '@clerk/backend';
import { clerkClient } from '../lib/clerk.js';
import { getOrCreateUser } from '../lib/users.js';

declare module 'hono' {
  interface ContextVariableMap {
    user: { id: string; email: string; displayName: string | null } | null;
  }
}

export const clerkAuthMiddleware: MiddlewareHandler = async (c, next) => {
  const authz = c.req.header('authorization');
  const token = authz?.startsWith('Bearer ') ? authz.slice(7) : null;

  if (!token) {
    c.set('user', null);
    return next();
  }

  try {
    const payload = await verifyToken(token, { secretKey: process.env.CLERK_SECRET_KEY! });
    const clerkUserId = payload.sub;
    const user = await getOrCreateUser(clerkUserId, async () => {
      const u = await clerkClient.users.getUser(clerkUserId);
      const primary = u.emailAddresses.find((e) => e.id === u.primaryEmailAddressId);
      const email = primary?.emailAddress ?? u.emailAddresses[0]?.emailAddress ?? `${clerkUserId}@unknown.local`;
      const displayName = [u.firstName, u.lastName].filter(Boolean).join(' ') || null;
      return { email, displayName };
    });
    c.set('user', { id: user.id, email: user.email, displayName: user.displayName });
  } catch {
    c.set('user', null);
  }
  return next();
};
```

- [ ] **Step 2: Wire it into `index.ts`**

In `apps/api/src/index.ts`:
- Replace the import line `import { sessionMiddleware } from './middleware/session.js';` with `import { clerkAuthMiddleware } from './middleware/clerk-auth.js';`
- Remove the line `import { auth } from './routes/auth.js';` (if present).
- Replace `app.use('*', sessionMiddleware);` with `app.use('*', clerkAuthMiddleware);`
- Remove the line `app.route('/', auth);` (if present).

(Confirm current auth-route mount with `grep -n "auth" apps/api/src/index.ts` first.)

- [ ] **Step 3: Delete Lucia files**

```bash
git rm apps/api/src/routes/auth.ts apps/api/src/lib/auth.ts apps/api/src/middleware/session.ts
```

- [ ] **Step 4: Type-check**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors. If errors mention `schema.sessions`, ensure Task 3 removed all references.

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/middleware/clerk-auth.ts apps/api/src/index.ts
git commit -m "feat(api): Clerk Bearer-token middleware; remove Lucia auth"
```

---

## Task 7: Rewrite backend tests for Clerk; delete Lucia tests

**Files:** Create `apps/api/tests/helpers/with-user.ts`; Modify `apps/api/tests/integration/{me-route,generate-route,history-route}.test.ts`; Delete `apps/api/tests/integration/auth-routes.test.ts`

- [ ] **Step 1: Create the test helper**

Create `apps/api/tests/helpers/with-user.ts`:
```typescript
import type { MiddlewareHandler } from 'hono';

export type TestUser = { id: string; email: string; displayName: string | null } | null;

// Stubs clerkAuthMiddleware in tests: injects a fixed user (or null for anon)
// without needing a real Clerk token.
export const withUser = (user: TestUser): MiddlewareHandler => async (c, next) => {
  c.set('user', user);
  return next();
};
```

- [ ] **Step 2: Delete the Lucia auth-routes test**

```bash
git rm apps/api/tests/integration/auth-routes.test.ts
```

- [ ] **Step 3: Rewrite `me-route.test.ts`**

Replace the entire contents of `apps/api/tests/integration/me-route.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { me } from '@/routes/me';
import { withUser } from '../helpers/with-user';
import { db, schema } from '@/lib/db';
import { resetAllTables } from '../setup';

const seedUser = async () => {
  const [u] = await db
    .insert(schema.users)
    .values({ email: 'me@test.com', clerkUserId: 'clerk_me', displayName: 'Me' })
    .returning({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName });
  return u!;
};

describe('GET /api/me', () => {
  beforeEach(async () => {
    await resetAllTables();
  });

  it('returns user: null when anonymous', async () => {
    const app = new Hono();
    app.use('*', withUser(null));
    app.route('/', me);
    const res = await app.request('/api/me');
    expect(res.status).toBe(200);
    expect((await res.json()).user).toBeNull();
  });

  it('returns user + null profileSummary when authed without profile', async () => {
    const u = await seedUser();
    const app = new Hono();
    app.use('*', withUser({ id: u.id, email: u.email, displayName: u.displayName }));
    app.route('/', me);
    const res = await app.request('/api/me');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.user.email).toBe('me@test.com');
    expect(body.profileSummary).toBeNull();
  });
});
```

- [ ] **Step 4: Rewrite `generate-route.test.ts` user test**

Open `apps/api/tests/integration/generate-route.test.ts`. Remove the imports `import { sessionMiddleware } from '@/middleware/session';` and `import { auth as authRoutes } from '@/routes/auth';`. Add `import { withUser } from '../helpers/with-user';` and (if not present) `import { db, schema } from '@/lib/db';`.

Replace the "attaches userId" test body with:
```typescript
  it('attaches userId when authenticated', async () => {
    const [u] = await db
      .insert(schema.users)
      .values({ email: 'u@test.com', clerkUserId: 'clerk_u', displayName: null })
      .returning({ id: schema.users.id });

    const app = new Hono();
    app.use('*', withUser({ id: u!.id, email: 'u@test.com', displayName: null }));
    app.route('/', generate);

    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(200);
    const rows = await db.select().from(schema.generations);
    expect(rows[0]!.userId).toBe(u!.id);
  });
```
(`validBody` is the valid wizard-input object already defined near the top of this file from the original `/api/generate` tests — reuse whatever name it uses; if it's named differently, match the existing constant. Other tests in this file that build an app for anonymous generate should use `app.use('*', withUser(null))` if they relied on `sessionMiddleware`. Check each `new Hono()` block and replace any `sessionMiddleware` use with `withUser(null)`, and remove the now-unused `sessionMiddleware`/`auth` imports.)

- [ ] **Step 5: Rewrite `history-route.test.ts`**

Replace the entire contents of `apps/api/tests/integration/history-route.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { me } from '@/routes/me';
import { generate } from '@/routes/generate';
import { withUser } from '../helpers/with-user';
import { db, schema } from '@/lib/db';
import { resetAllTables } from '../setup';

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

type U = { id: string; email: string; displayName: string | null };

const seedUser = async (email: string, clerkUserId: string): Promise<U> => {
  const [u] = await db
    .insert(schema.users)
    .values({ email, clerkUserId, displayName: null })
    .returning({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName });
  return u!;
};

const appFor = (user: U | null) => {
  const a = new Hono();
  a.use('*', withUser(user));
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

const gen = (app: Hono) =>
  app.request('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
    body: JSON.stringify(validInputs),
  });

describe('GET /api/me/history', () => {
  beforeEach(async () => {
    await resetAllTables();
  });

  it('returns 401 when anonymous', async () => {
    const res = await appFor(null).request('/api/me/history');
    expect(res.status).toBe(401);
  });

  it('returns empty list for a new user', async () => {
    const u = await seedUser('h@test.com', 'clerk_h');
    const res = await appFor(u).request('/api/me/history');
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.entries).toEqual([]);
    expect(body.total).toBe(0);
  });

  it('returns entries newest-first', async () => {
    const u = await seedUser('h@test.com', 'clerk_h');
    const app = appFor(u);
    for (let i = 0; i < 3; i++) {
      await gen(app);
      await new Promise((r) => setTimeout(r, 10));
    }
    const res = await app.request('/api/me/history');
    const body = await res.json();
    expect(body.entries.length).toBe(3);
    expect(body.total).toBe(3);
    expect(new Date(body.entries[0].createdAt).getTime()).toBeGreaterThan(
      new Date(body.entries[2].createdAt).getTime(),
    );
  });

  it('does not return other users entries', async () => {
    const a = await seedUser('a@test.com', 'clerk_a');
    const b = await seedUser('b@test.com', 'clerk_b');
    await gen(appFor(a));
    const res = await appFor(b).request('/api/me/history');
    const body = await res.json();
    expect(body.entries.length).toBe(0);
  });
});
```

- [ ] **Step 6: Run the full API suite**

Run: `cd apps/api && npm test`
Expected: all green. Files: db, feedback-route, generate-route, history-route, me-route, rag, update-profiles, users (+ any others). No auth-routes file.

- [ ] **Step 7: Commit**

```bash
git add apps/api/tests
git commit -m "test(api): rewrite auth-dependent tests to inject user via withUser; drop Lucia tests"
```

---

## Task 8: Frontend dependency

**Files:** Modify `apps/web/package.json`

- [ ] **Step 1: Add Clerk**

Add to `apps/web/package.json` `dependencies`:
```
"@clerk/nextjs": "^6.9.0",
```

- [ ] **Step 2: Install**

Run: `npm install --workspaces --include-workspace-root --no-audit --no-fund`

- [ ] **Step 3: Commit**

```bash
git add apps/web/package.json package-lock.json
git commit -m "build(web): add @clerk/nextjs"
```

---

## Task 9: Clerk Next.js middleware (exclude /api/*)

**Files:** Create `apps/web/middleware.ts`

- [ ] **Step 1: Implement**

Create `apps/web/middleware.ts`:
```typescript
import { clerkMiddleware } from '@clerk/nextjs/server';

export default clerkMiddleware();

export const config = {
  matcher: [
    // Run on all routes EXCEPT Next internals, static files, and /api/*
    // (the latter are rewritten to the Fly backend, which self-verifies).
    '/((?!_next|api|.*\\.(?:html?|css|js(?!on)|jpe?g|png|gif|svg|ico|woff2?|ttf)).*)',
  ],
};
```

- [ ] **Step 2: Verify the matcher excludes /api**

Confirm by reading: the regex must contain `api` in the negative lookahead group. (No automated test; this is verified by the smoke test in Task 17 — `/api/*` calls must still reach Fly.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/middleware.ts
git commit -m "feat(web): Clerk middleware, excluding the /api proxy path"
```

---

## Task 10: ClerkProvider in the layout (themed)

**Files:** Modify `apps/web/app/layout.tsx`

- [ ] **Step 1: Wrap the app**

In `apps/web/app/layout.tsx`, import Clerk and wrap `<html>` in `<ClerkProvider>` with brand theming. Add at top:
```typescript
import { ClerkProvider } from '@clerk/nextjs';
```
Change the returned JSX so `<ClerkProvider>` is the outermost element:
```tsx
  return (
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#4f46e5',
          fontFamily: 'var(--font-geist-sans)',
        },
      }}
    >
      <html lang="en">
        <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
          <ShowcaseHeader />
          {children}
        </body>
      </html>
    </ClerkProvider>
  );
```

- [ ] **Step 2: Verify it builds (needs keys from Task 1)**

Run: `cd apps/web && npm run build`
Expected: builds. If it errors with "Missing publishableKey", confirm `apps/web/.env.local` has `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` (Task 1).

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/layout.tsx
git commit -m "feat(web): wrap app in ClerkProvider with brand theming"
```

---

## Task 11: Sign-in / sign-up pages; delete old auth pages

**Files:** Create `apps/web/app/sign-in/[[...sign-in]]/page.tsx`, `apps/web/app/sign-up/[[...sign-up]]/page.tsx`; Delete `apps/web/app/login/`, `apps/web/app/signup/`, `apps/web/components/auth/AuthForm.tsx`

- [ ] **Step 1: Create sign-in page**

Create `apps/web/app/sign-in/[[...sign-in]]/page.tsx`:
```tsx
import { SignIn } from '@clerk/nextjs';

export default function SignInPage() {
  return (
    <main className="mx-auto flex max-w-md justify-center px-6 py-16">
      <SignIn />
    </main>
  );
}
```

- [ ] **Step 2: Create sign-up page**

Create `apps/web/app/sign-up/[[...sign-up]]/page.tsx`:
```tsx
import { SignUp } from '@clerk/nextjs';

export default function SignUpPage() {
  return (
    <main className="mx-auto flex max-w-md justify-center px-6 py-16">
      <SignUp />
    </main>
  );
}
```

- [ ] **Step 3: Delete old auth pages + form**

```bash
git rm -r apps/web/app/login apps/web/app/signup apps/web/components/auth/AuthForm.tsx
```

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/sign-in apps/web/app/sign-up
git commit -m "feat(web): Clerk SignIn/SignUp pages; remove custom auth pages"
```

---

## Task 12: Token-aware API client + useApi hook; migrate wizard + FeedbackForm

**Files:** Modify `apps/web/lib/api-client.ts`; Create `apps/web/lib/use-api.ts`; Modify `apps/web/app/wizard/page.tsx`, `apps/web/components/FeedbackForm.tsx`

- [ ] **Step 1: Add optional Bearer token to api-client**

In `apps/web/lib/api-client.ts`, change the two functions to accept an optional token and drop `credentials: 'include'`:
```typescript
export async function apiPost<TRes>(path: string, body: unknown, token?: string): Promise<TRes> {
  const res = await fetch(path, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(
      (errBody as { error?: string }).error ?? `Request failed (${res.status})`,
      res.status,
      errBody,
    );
  }
  return res.json() as Promise<TRes>;
}

export async function apiGet<TRes>(path: string, token?: string): Promise<TRes> {
  const res = await fetch(path, {
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  if (!res.ok) {
    const errBody = await res.json().catch(() => ({}));
    throw new ApiError(
      (errBody as { error?: string }).error ?? `Request failed (${res.status})`,
      res.status,
      errBody,
    );
  }
  return res.json() as Promise<TRes>;
}
```
(Keep the `ApiError` class and the leading comment.)

- [ ] **Step 2: Create the useApi hook**

Create `apps/web/lib/use-api.ts`:
```typescript
'use client';

import { useAuth } from '@clerk/nextjs';
import { apiGet, apiPost } from '@/lib/api-client';

// Wraps the API client with the current Clerk session token. When signed out,
// getToken() returns null and calls go through anonymously.
export function useApi() {
  const { getToken } = useAuth();
  return {
    apiGet: async <T>(path: string): Promise<T> => apiGet<T>(path, (await getToken()) ?? undefined),
    apiPost: async <T>(path: string, body: unknown): Promise<T> =>
      apiPost<T>(path, body, (await getToken()) ?? undefined),
  };
}
```

- [ ] **Step 3: Migrate the wizard**

In `apps/web/app/wizard/page.tsx`:
- Replace `import { apiPost, ApiError } from '@/lib/api-client';` with:
```typescript
import { ApiError } from '@/lib/api-client';
import { useApi } from '@/lib/use-api';
```
- Inside `WizardPage`, near the other hooks (e.g., after `const router = useRouter();`), add:
```typescript
  const { apiPost } = useApi();
```
The existing `await apiPost<GenerateResponse>('/api/generate', payload);` call now uses the hook version.

- [ ] **Step 4: Migrate FeedbackForm**

In `apps/web/components/FeedbackForm.tsx`:
- Replace `import { apiPost } from '@/lib/api-client';` with `import { useApi } from '@/lib/use-api';`
- Inside `FeedbackForm`, add `const { apiPost } = useApi();` near the `useState` hooks.
The existing `await apiPost('/api/feedback', payload);` now uses the hook version.

- [ ] **Step 5: Build**

Run: `cd apps/web && npm run build`
Expected: builds (history/account/result still import `useAuth` from the old hook — that's removed in Tasks 13–14; if you run build now it still passes because those files are unchanged and `lib/use-auth.ts` still exists).

- [ ] **Step 6: Commit**

```bash
git add apps/web/lib/api-client.ts apps/web/lib/use-api.ts apps/web/app/wizard/page.tsx apps/web/components/FeedbackForm.tsx
git commit -m "feat(web): token-aware API client + useApi hook; wizard + feedback use it"
```

---

## Task 13: Header (Clerk components) + result-page CTA

**Files:** Modify `apps/web/components/ShowcaseHeader.tsx`, `apps/web/app/wizard/result/page.tsx`

- [ ] **Step 1: Rewrite ShowcaseHeader**

Replace the entire contents of `apps/web/components/ShowcaseHeader.tsx`:
```tsx
'use client';

import Link from 'next/link';
import { SignedIn, SignedOut, SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';

export function ShowcaseHeader() {
  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-serif text-base italic tracking-tight">
          Composed
        </Link>
        <nav className="flex items-center gap-3 text-sm text-slate-600">
          <Link href="/history" className="hover:text-slate-900">History</Link>
          <Link href="/about" className="hover:text-slate-900">How it works</Link>
          <SignedOut>
            <SignInButton mode="modal">
              <Button variant="ghost" size="sm">Sign in</Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button size="sm">Sign up</Button>
            </SignUpButton>
          </SignedOut>
          <SignedIn>
            <Link href="/account" className="hover:text-slate-900">Account</Link>
            <UserButton afterSignOutUrl="/" />
          </SignedIn>
        </nav>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: Update the result-page CTA**

In `apps/web/app/wizard/result/page.tsx`:
- Replace `import { useAuth } from '@/lib/use-auth';` with `import { SignedOut, SignUpButton } from '@clerk/nextjs';`
- Remove the line `const auth = useAuth();`
- Replace the `{auth.status === 'anonymous' && ( … )}` block with a `<SignedOut>` wrapper. The inner "Sign up"/"Sign in" links become Clerk buttons:
```tsx
      <SignedOut>
        <div className="mt-6 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <p className="text-sm font-medium text-indigo-900">
            Save this prompt and unlock smarter ones over time
          </p>
          <p className="mt-1 text-sm text-indigo-700">
            Sign up to keep your history across devices. The system also starts learning your
            preferences and uses past high-rated prompts to make new ones even better.
          </p>
          <div className="mt-3 flex gap-2">
            <SignUpButton mode="modal">
              <button className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
                Sign up
              </button>
            </SignUpButton>
            <SignInButton mode="modal">
              <button className="rounded border border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100">
                Sign in
              </button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>
```
- Add `SignInButton` to the import: `import { SignedOut, SignUpButton, SignInButton } from '@clerk/nextjs';`

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/ShowcaseHeader.tsx apps/web/app/wizard/result/page.tsx
git commit -m "feat(web): Clerk-driven header + result-page sign-up CTA"
```

---

## Task 14: Account + history pages on Clerk; delete use-auth

**Files:** Modify `apps/web/app/account/page.tsx`, `apps/web/app/history/page.tsx`; Delete `apps/web/lib/use-auth.ts`

- [ ] **Step 1: Rewrite the account page**

Replace the entire contents of `apps/web/app/account/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useApi } from '@/lib/use-api';
import type { MeResponse } from '@composed-prompts/shared';

export default function AccountPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { apiGet } = useApi();
  const [profileSummary, setProfileSummary] = useState<string | null>(null);

  useEffect(() => {
    if (!isSignedIn) return;
    apiGet<MeResponse>('/api/me')
      .then((d) => setProfileSummary('profileSummary' in d ? d.profileSummary : null))
      .catch(() => setProfileSummary(null));
  }, [isSignedIn, apiGet]);

  if (!isLoaded) {
    return <main className="mx-auto max-w-md px-6 py-16">Loading…</main>;
  }
  if (!isSignedIn) {
    return (
      <main className="mx-auto max-w-md px-6 py-16">
        <p>You&apos;re not signed in.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-16">
      <h1 className="text-3xl font-semibold">Your account</h1>
      <dl className="mt-6 grid gap-3 text-sm">
        <div>
          <dt className="text-slate-500">Email</dt>
          <dd className="font-medium">{user.primaryEmailAddress?.emailAddress}</dd>
        </div>
        {profileSummary && (
          <div>
            <dt className="text-slate-500">What we&apos;ve learned about your study style</dt>
            <dd className="mt-1 rounded border bg-white p-3 text-xs leading-relaxed">{profileSummary}</dd>
          </div>
        )}
      </dl>
      <p className="mt-8 text-xs text-slate-500">Manage your account from the avatar menu in the top-right.</p>
    </main>
  );
}
```

- [ ] **Step 2: Rewrite the history page's auth wiring**

In `apps/web/app/history/page.tsx`:
- Replace `import { useAuth } from '@/lib/use-auth';` and `import { apiGet } from '@/lib/api-client';` with:
```typescript
import { useUser } from '@clerk/nextjs';
import { useApi } from '@/lib/use-api';
```
- Replace `const auth = useAuth();` with:
```typescript
  const { isLoaded, isSignedIn } = useUser();
  const { apiGet } = useApi();
```
- Replace the effect's guard and branches:
```typescript
  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      apiGet<HistoryResponse>('/api/me/history')
        .then((res) => {
          setEntries(
            res.entries.map((e) => ({
              id: e.id,
              createdAt: new Date(e.createdAt).getTime(),
              promptText: e.promptText,
              llm: e.llm,
              model: e.model,
              mode: e.mode,
              courseId: e.courseId,
              rating: (e.rating ?? undefined) as DisplayEntry['rating'],
              ratingText: e.ratingText ?? undefined,
              source: 'server',
            })),
          );
        })
        .catch(() => setEntries([]));
    } else {
      setEntries(listHistory().map((e) => ({ ...e, source: 'local' })));
    }
  }, [isLoaded, isSignedIn, apiGet]);
```
- Replace the loading guard `if (auth.status === 'loading' || entries === null)` with `if (!isLoaded || entries === null)`.
- In the empty-state and subtitle, replace `auth.status === 'anonymous'` with `!isSignedIn` and `auth.status === 'authed'` with `isSignedIn`.

- [ ] **Step 3: Delete the old hook**

```bash
git rm apps/web/lib/use-auth.ts
```

- [ ] **Step 4: Confirm no remaining references**

Run: `grep -rn "use-auth\|useAuth(" apps/web/app apps/web/components`
Expected: no matches (Clerk's `useAuth` is imported as `from '@clerk/nextjs'` only inside `lib/use-api.ts`; that's fine and is a different import).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/account/page.tsx apps/web/app/history/page.tsx
git commit -m "feat(web): account + history on Clerk useUser; remove custom useAuth"
```

---

## Task 15: Build + test the frontend

**Files:** none (verification)

- [ ] **Step 1: Build**

Run: `cd apps/web && npm run build`
Expected: succeeds. Routes include `/sign-in/[[...sign-in]]`, `/sign-up/[[...sign-up]]`, `/account`, `/history`, `/wizard`, `/wizard/result`. No `/login` or `/signup`.

- [ ] **Step 2: Unit tests**

Run: `cd apps/web && npx vitest run`
Expected: existing tests pass (storage-history, smoke).

- [ ] **Step 3: Commit (if any lockfile/incidental changes)**

```bash
git add -A
git commit -m "chore(web): verify Clerk build + tests" --allow-empty
```

---

## Task 16: [USER ACTION] Production secrets + deploy

No code.

- [ ] **Step 1: Vercel env (production)**

In Vercel → project → Settings → Environment Variables (Production), add:
- `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` = your **production** Clerk publishable key (`pk_live_…`)
- `CLERK_SECRET_KEY` = production secret (`sk_live_…`)
- `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`, `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/account`, `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/account`

(Production keys require creating a **production instance** in Clerk and configuring your own Google OAuth credentials there: Clerk → your prod instance → Google → custom credentials → paste a Google Cloud OAuth Client ID/Secret and add Clerk's callback URL to Google Cloud's authorized redirect URIs. Clerk shows the exact callback URL to register.)

- [ ] **Step 2: Fly secret**

```bash
fly secrets set CLERK_SECRET_KEY=sk_live_xxx -a composed-prompts-api
```
(This restarts the machine.)

- [ ] **Step 3: Deploy backend**

```bash
fly deploy -c fly.toml --dockerfile apps/api/Dockerfile
```

- [ ] **Step 4: Run the migration against production DB**

The new migration must be applied to the production Neon database. With the production `DATABASE_URL` available locally:
```bash
cd apps/api
# WARNING: clears existing users/generations (throwaway). Point DATABASE_URL at prod.
npx tsx scripts/reset-for-clerk.ts
npm run db:migrate
```

- [ ] **Step 5: Deploy frontend**

```bash
git push origin main   # Vercel auto-deploys
```

---

## Task 17: [USER ACTION + verify] Production smoke test

No code. Verify the live flow at https://composed-prompts.vercel.app.

- [ ] **Step 1: Anonymous**

Open the site signed out. Header shows Sign in / Sign up. Generate a prompt without signing in — it still works (anonymous path).

- [ ] **Step 2: Google sign-up**

Click Sign up → choose **Continue with Google** → complete Google's flow → land back on `/account` showing your Google email. Header shows the `<UserButton>` avatar.

- [ ] **Step 3: Generate + history**

Generate a prompt while signed in, rate it, open `/history` → the entry appears (server-backed). Sign out via the avatar menu, sign back in → history persists.

- [ ] **Step 4: Backend token path**

Confirm the API is receiving tokens: `fly logs -a composed-prompts-api` shows no auth errors during the signed-in generate. Optionally verify a `users` row exists with your `clerk_user_id`.

**Done.** Google sign-in is live via Clerk.

---

## Notes for the implementer

- **Order matters:** Task 1 (Clerk app + keys) must be first — the frontend build (Task 10+) and backend runtime need keys.
- **Tests never call Clerk:** integration tests inject a user with `withUser(...)`; `getOrCreateUser` is tested with a stub `fetchProfile`. No real Clerk network calls in CI.
- **`vitest run` does not type-check.** The `with-user.ts` helper relies on the `ContextVariableMap` augmentation declared in `clerk-auth.ts`; this is fine at runtime. `npm run build` (tsc) only compiles `src/`, not tests.
- **The proxy stays.** `apps/web/next.config.mjs` keeps the `/api/*` → Fly rewrite. Clerk's Next middleware is configured to skip `/api/*` (Task 9).
- **Anonymous generate is preserved** end to end: no token → no `Authorization` header → backend `user = null`.
