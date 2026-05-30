# Grade Detection Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Detect a student's grade from their Pomfret email, store it, inject it into the generated prompt's About-Me, and show it on the account page with a manual override.

**Architecture:** A pure shared `grade.ts` (one `SENIOR_CLASS_GRAD_YEAR=2027` constant + three helpers) drives everything. A nullable `users.grad_year` column (additive migration) is filled at provisioning + lazily backfilled. The grade is threaded into generation as an optional `studentGrade` string (wizard/Zod untouched). `/api/me` returns it; `PATCH /api/me/grade` overrides it; the account page shows + edits it.

**Tech Stack:** TypeScript, Drizzle/Postgres, Hono, Zod, Vitest, Next.js 14 (Clerk).

**Spec:** `docs/superpowers/specs/2026-05-29-grade-detection-design.md`

---

## File map

- **Create** `packages/shared/src/grade.ts` + `tests/unit/grade.test.ts`; **Modify** `packages/shared/src/index.ts`
- **Modify** `packages/shared/src/templates/shared.ts` (`buildAboutMeSection`), `src/generation/assembler.ts`, `src/generation/opus-full-prompt.ts`, `src/api-contracts.ts` (+ their tests)
- **Modify** `apps/api/src/schema.ts` (+ new migration), `src/lib/users.ts`, `src/middleware/clerk-auth.ts`, `src/lib/pipeline.ts`, `src/routes/generate.ts`, `src/routes/me.ts`, `tests/helpers/with-user.ts` (+ users/me tests)
- **Modify** `apps/web/lib/api-client.ts`, `apps/web/lib/use-api.ts`, `apps/web/app/account/page.tsx`

---

## Task 1: Shared `grade.ts` (TDD)

**Files:** Create `packages/shared/src/grade.ts`, `packages/shared/tests/unit/grade.test.ts`; Modify `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/tests/unit/grade.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { detectGradYear, gradeFromGradYear, gradYearFromGrade } from '@composed-prompts/shared';

describe('grade', () => {
  it('detects grad year from a Pomfret email', () => {
    expect(detectGradYear('jdoe27@pomfret.org')).toBe(2027);
    expect(detectGradYear('a.b.29@pomfret.org')).toBe(2029);
    expect(detectGradYear('JDOE30@Pomfret.org')).toBe(2030);
  });

  it('returns null for non-Pomfret, unparseable, or out-of-window emails', () => {
    expect(detectGradYear('jdoe27@gmail.com')).toBeNull();
    expect(detectGradYear('smith@pomfret.org')).toBeNull();   // no digits
    expect(detectGradYear('room100@pomfret.org')).toBeNull(); // 3 digits
    expect(detectGradYear('jdoe26@pomfret.org')).toBeNull();  // graduated
    expect(detectGradYear('jdoe31@pomfret.org')).toBeNull();  // not yet enrolled
  });

  it('maps grad year to grade label', () => {
    expect(gradeFromGradYear(2027)).toBe('Senior');
    expect(gradeFromGradYear(2028)).toBe('Junior');
    expect(gradeFromGradYear(2029)).toBe('Sophomore');
    expect(gradeFromGradYear(2030)).toBe('Freshman');
    expect(gradeFromGradYear(2026)).toBeNull();
    expect(gradeFromGradYear(null)).toBeNull();
  });

  it('inverts a grade label back to a grad year', () => {
    expect(gradYearFromGrade('Senior')).toBe(2027);
    expect(gradYearFromGrade('Sophomore')).toBe(2029);
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd packages/shared && npx vitest run tests/unit/grade.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/shared/src/grade.ts`:
```typescript
export const SENIOR_CLASS_GRAD_YEAR = 2027;

export type Grade = 'Freshman' | 'Sophomore' | 'Junior' | 'Senior';

const GRADE_BY_NUMBER: Record<number, Grade> = {
  9: 'Freshman',
  10: 'Sophomore',
  11: 'Junior',
  12: 'Senior',
};

const NUMBER_BY_GRADE: Record<Grade, number> = {
  Freshman: 9,
  Sophomore: 10,
  Junior: 11,
  Senior: 12,
};

// Parse a Pomfret email's trailing 2-digit grad year. Accepts only currently
// enrolled classes (SENIOR_CLASS_GRAD_YEAR .. +3). Returns 4-digit year or null.
export function detectGradYear(email: string): number | null {
  const m = email.trim().toLowerCase().match(/^([^@]+)@pomfret\.org$/);
  if (!m) return null;
  const digits = m[1]!.match(/(\d+)$/);
  if (!digits || digits[1]!.length !== 2) return null;
  const year = 2000 + parseInt(digits[1]!, 10);
  if (year < SENIOR_CLASS_GRAD_YEAR || year > SENIOR_CLASS_GRAD_YEAR + 3) return null;
  return year;
}

// 2027 -> 'Senior' ... 2030 -> 'Freshman'; outside 9..12 -> null.
export function gradeFromGradYear(gradYear: number | null | undefined): Grade | null {
  if (gradYear == null) return null;
  const num = 12 - (gradYear - SENIOR_CLASS_GRAD_YEAR);
  return GRADE_BY_NUMBER[num] ?? null;
}

// Inverse for the manual override: 'Senior' -> 2027 ... 'Freshman' -> 2030.
export function gradYearFromGrade(grade: Grade): number {
  return SENIOR_CLASS_GRAD_YEAR + (12 - NUMBER_BY_GRADE[grade]);
}
```

- [ ] **Step 4: Export from the barrel**

In `packages/shared/src/index.ts`, add after the `export * from './material-kinds.js';` line:
```typescript
export * from './grade.js';
```

- [ ] **Step 5: Run, verify it passes**

Run: `cd packages/shared && npx vitest run tests/unit/grade.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/grade.ts packages/shared/src/index.ts packages/shared/tests/unit/grade.test.ts
git commit -m "feat(shared): grade.ts — detect/map/invert grad year (anchor 2027)"
```

---

## Task 2: Thread `studentGrade` into the deterministic path (TDD)

**Files:** Modify `packages/shared/src/templates/shared.ts`, `packages/shared/src/generation/assembler.ts`, `packages/shared/tests/unit/templates-shared.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/shared/tests/unit/templates-shared.test.ts`, add (reuse the file's existing `baseInputs` fixture):
```typescript
  it('includes grade in About-Me when provided', () => {
    expect(buildAboutMeSection(baseInputs, 'Sophomore')).toContain('- Grade: Sophomore');
  });

  it('omits grade from About-Me when not provided', () => {
    expect(buildAboutMeSection(baseInputs)).not.toContain('Grade:');
  });
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd packages/shared && npx vitest run tests/unit/templates-shared.test.ts`
Expected: FAIL — `buildAboutMeSection` takes one arg / no grade line.

- [ ] **Step 3: Implement `buildAboutMeSection`**

In `packages/shared/src/templates/shared.ts`, change the `buildAboutMeSection` signature and add the grade line first:
```typescript
export function buildAboutMeSection(inputs: WizardInputs, studentGrade?: string): string {
  const lines: string[] = [];
  if (studentGrade) {
    lines.push(`- Grade: ${studentGrade}`);
  }
  if (inputs.courseId) {
```
(Leave the rest of the function body unchanged.)

- [ ] **Step 4: Thread it through the assembler**

In `packages/shared/src/generation/assembler.ts`:
- Add `studentGrade` to `AssembleOptions`:
```typescript
export type AssembleOptions = {
  interactionStyleOverride?: string;
  studentGrade?: string;
};
```
- In `assembleSections`, pass it to the About-Me builder. Change the `about_me` line to:
```typescript
    { name: 'about_me', body: buildAboutMeSection(inputs, opts.studentGrade) },
```

- [ ] **Step 5: Run, verify it passes**

Run: `cd packages/shared && npx vitest run tests/unit/templates-shared.test.ts`
Expected: PASS (including prior tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/templates/shared.ts packages/shared/src/generation/assembler.ts packages/shared/tests/unit/templates-shared.test.ts
git commit -m "feat(shared): thread studentGrade into deterministic About-Me"
```

---

## Task 3: Thread `studentGrade` into the Opus path (TDD)

**Files:** Modify `packages/shared/src/generation/opus-full-prompt.ts`, `packages/shared/tests/unit/opus-full-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/shared/tests/unit/opus-full-prompt.test.ts`, add (reuse the existing `inputs` fixture + `mockCreate` mock):
```typescript
  it('includes the grade line in the user message when studentGrade is set', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await generateFullPromptWithOpus(inputs, '', 'Sophomore');
    const call = mockCreate.mock.calls[0]![0];
    expect(call.messages[0].content as string).toContain("Student's grade: Sophomore");
  });
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd packages/shared && npx vitest run tests/unit/opus-full-prompt.test.ts`
Expected: FAIL — grade line absent.

- [ ] **Step 3: Implement**

In `packages/shared/src/generation/opus-full-prompt.ts`:
- Change `buildUserMessage` to accept the grade and add a line. Replace its signature line `const buildUserMessage = (inputs: WizardInputs): string => {` with:
```typescript
const buildUserMessage = (inputs: WizardInputs, studentGrade?: string): string => {
```
- In the `lines` array, insert a grade entry right after the `courseDesc,` line (so it reads):
```typescript
    courseLine,
    courseDesc,
    studentGrade ? `Student's grade: ${studentGrade}` : '',
    '',
    `Student's LLM: ${inputs.provider} / ${inputs.model}`,
```
- Update `generateFullPromptWithOpus` to accept + forward it. Change its signature to:
```typescript
export async function generateFullPromptWithOpus(
  inputs: WizardInputs,
  ragContext: string = '',
  studentGrade?: string,
): Promise<OpusFullPromptResult> {
```
- and change the `buildUserMessage(inputs)` call inside it to:
```typescript
    const userMessage = buildUserMessage(inputs, studentGrade) + (ragContext ? `\n\n${ragContext}` : '');
```
(`OPUS_SYSTEM_PROMPT` stays unchanged — caching preserved.)

- [ ] **Step 4: Run, verify it passes**

Run: `cd packages/shared && npx vitest run tests/unit/opus-full-prompt.test.ts`
Expected: PASS (including existing model/caching/attach tests).

- [ ] **Step 5: Full shared suite + commit**

```bash
cd packages/shared && npx vitest run
```
Expected: all shared tests pass.
```bash
git add packages/shared/src/generation/opus-full-prompt.ts packages/shared/tests/unit/opus-full-prompt.test.ts
git commit -m "feat(shared): thread studentGrade into Opus user message"
```

---

## Task 4: Add `grad_year` column + migration

**Files:** Modify `apps/api/src/schema.ts`; new file under `apps/api/drizzle/`

- [ ] **Step 1: Add the column**

In `apps/api/src/schema.ts`, add `gradYear` to the `users` table (the `integer` import already exists). The `users` block becomes:
```typescript
export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  gradYear: integer('grad_year'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});
```

- [ ] **Step 2: Generate the migration (non-interactive — pure add)**

Run: `cd apps/api && npm run db:generate`
This is a single `ADD COLUMN "grad_year" integer` (nullable) — no drops, so drizzle-kit does NOT prompt. Expected: a new `apps/api/drizzle/0004_*.sql` containing `ADD COLUMN "grad_year" integer;`.

- [ ] **Step 3: Apply it (safe on the live DB)**

Run: `cd apps/api && npm run db:migrate`
Adding a nullable column is additive and non-breaking — no downtime, no data clear, and it won't break the currently-deployed backend (which simply ignores the new column).

- [ ] **Step 4: Commit**

```bash
git add apps/api/src/schema.ts apps/api/drizzle
git commit -m "feat(api): add nullable users.grad_year column"
```

---

## Task 5: Detection + lazy backfill in `getOrCreateUser` (TDD)

**Files:** Modify `apps/api/src/lib/users.ts`, `apps/api/tests/integration/users.test.ts`

- [ ] **Step 1: Write the failing tests**

In `apps/api/tests/integration/users.test.ts`, add (the file imports `getOrCreateUser`, `db`, `schema`, `resetAllTables`, `vi`):
```typescript
  it('sets gradYear from a Pomfret email on insert', async () => {
    const u = await getOrCreateUser('clerk_grad', async () => ({ email: 'jdoe29@pomfret.org', displayName: null }));
    expect(u.gradYear).toBe(2029);
  });

  it('leaves gradYear null for a non-Pomfret email', async () => {
    const u = await getOrCreateUser('clerk_personal', async () => ({ email: 'jdoe29@gmail.com', displayName: null }));
    expect(u.gradYear).toBeNull();
  });

  it('backfills gradYear for an existing row whose grad_year is null', async () => {
    const [row] = await db
      .insert(schema.users)
      .values({ clerkUserId: 'clerk_back', email: 'bsmith28@pomfret.org', displayName: null })
      .returning({ id: schema.users.id });
    const u = await getOrCreateUser('clerk_back', async () => ({ email: 'unused@x.com', displayName: null }));
    expect(u.gradYear).toBe(2028);
    const [reloaded] = await db.select().from(schema.users).where(eq(schema.users.id, row!.id));
    expect(reloaded!.gradYear).toBe(2028);
  });

  it('never overwrites a non-null gradYear', async () => {
    await db
      .insert(schema.users)
      .values({ clerkUserId: 'clerk_manual', email: 'jdoe29@pomfret.org', displayName: null, gradYear: 2030 });
    const u = await getOrCreateUser('clerk_manual', async () => ({ email: 'jdoe29@pomfret.org', displayName: null }));
    expect(u.gradYear).toBe(2030); // manual value preserved, not re-detected to 2029
  });
```
(Ensure `eq` is imported from `drizzle-orm` at the top of the test file; add it if missing.)

- [ ] **Step 2: Run, verify it fails**

Run: `cd apps/api && npm test -- tests/integration/users.test.ts`
Expected: FAIL — `gradYear` undefined / not on `LocalUser`.

- [ ] **Step 3: Implement**

Replace the entire contents of `apps/api/src/lib/users.ts`:
```typescript
import { eq } from 'drizzle-orm';
import { detectGradYear } from '@composed-prompts/shared';
import { db, schema } from './db.js';

export type LocalUser = {
  id: string;
  email: string;
  displayName: string | null;
  clerkUserId: string;
  gradYear: number | null;
};

const cols = {
  id: schema.users.id,
  email: schema.users.email,
  displayName: schema.users.displayName,
  clerkUserId: schema.users.clerkUserId,
  gradYear: schema.users.gradYear,
};

export async function getOrCreateUser(
  clerkUserId: string,
  fetchProfile: () => Promise<{ email: string; displayName: string | null }>,
): Promise<LocalUser> {
  const [existing] = await db.select(cols).from(schema.users).where(eq(schema.users.clerkUserId, clerkUserId));
  if (existing) {
    // Lazy backfill: fill grad_year once for users provisioned before this feature.
    // Never overwrites a non-null value (protects manual overrides + prior detection).
    if (existing.gradYear == null) {
      const detected = detectGradYear(existing.email);
      if (detected != null) {
        await db.update(schema.users).set({ gradYear: detected }).where(eq(schema.users.id, existing.id));
        return { ...existing, gradYear: detected };
      }
    }
    return existing;
  }

  const profile = await fetchProfile();
  const [created] = await db
    .insert(schema.users)
    .values({
      clerkUserId,
      email: profile.email,
      displayName: profile.displayName,
      gradYear: detectGradYear(profile.email),
    })
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
Expected: PASS (new + existing idempotency test).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/users.ts apps/api/tests/integration/users.test.ts
git commit -m "feat(api): detect + lazily backfill users.grad_year in getOrCreateUser"
```

---

## Task 6: Wire `gradYear` through the request path

**Files:** Modify `apps/api/src/middleware/clerk-auth.ts`, `apps/api/tests/helpers/with-user.ts`, `apps/api/src/lib/pipeline.ts`, `apps/api/src/routes/generate.ts`

- [ ] **Step 1: Add `gradYear` to the user context**

In `apps/api/src/middleware/clerk-auth.ts`:
- Change the `ContextVariableMap` declaration's `user` type to:
```typescript
    user: { id: string; email: string; displayName: string | null; gradYear: number | null } | null;
```
- Change the `c.set('user', { ... })` line to include it:
```typescript
    c.set('user', { id: user.id, email: user.email, displayName: user.displayName, gradYear: user.gradYear });
```

- [ ] **Step 2: Update the test stub type**

In `apps/api/tests/helpers/with-user.ts`, change `TestUser` to make `gradYear` optional (existing call sites that omit it still run fine at runtime — it reads as `null`):
```typescript
export type TestUser = { id: string; email: string; displayName: string | null; gradYear?: number | null } | null;
```

- [ ] **Step 3: Thread `studentGrade` through the pipeline**

In `apps/api/src/lib/pipeline.ts`:
- Change `runPipeline`'s opts type:
```typescript
export async function runPipeline(
  inputs: WizardInputs,
  opts: { userId: string | null; studentGrade?: string } = { userId: null },
): Promise<PipelineResult> {
```
- Pass it to the Opus call — change `generateFullPromptWithOpus(inputs, ragText)` to:
```typescript
    const result = await generateFullPromptWithOpus(inputs, ragText, opts.studentGrade);
```
- Pass it to the deterministic call — change `assembleDeterministicPrompt(inputs)` to:
```typescript
  const prompt = assembleDeterministicPrompt(inputs, { studentGrade: opts.studentGrade });
```

- [ ] **Step 4: Compute + pass the grade in the generate route**

In `apps/api/src/routes/generate.ts`:
- Add to the imports from `@composed-prompts/shared`: `gradeFromGradYear` (add it to the existing import list).
- Replace the line `const userId = c.get('user')?.id ?? null;` with:
```typescript
    const authedUser = c.get('user');
    const userId = authedUser?.id ?? null;
    const studentGrade = gradeFromGradYear(authedUser?.gradYear ?? null) ?? undefined;
```
- Change the `runPipeline(inputs, { userId })` call to:
```typescript
    const result = await runPipeline(inputs, { userId, studentGrade });
```

- [ ] **Step 5: Verify the API suite still passes**

Run: `cd apps/api && npm test`
Expected: all pass (no behavior change for anonymous; the existing generate/history tests use `withUser` without `gradYear`, which now reads as `null` → grade omitted).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/middleware/clerk-auth.ts apps/api/tests/helpers/with-user.ts apps/api/src/lib/pipeline.ts apps/api/src/routes/generate.ts
git commit -m "feat(api): carry gradYear on the user context; pass studentGrade into generation"
```

---

## Task 7: `/api/me` returns grade + `PATCH /api/me/grade` (TDD)

**Files:** Modify `packages/shared/src/api-contracts.ts`, `apps/api/src/routes/me.ts`, `apps/api/tests/integration/me-route.test.ts`

- [ ] **Step 1: Update the contract**

In `packages/shared/src/api-contracts.ts`, change the `MeResponse` authed branch to add `gradYear` + `grade`:
```typescript
export type MeResponse = {
  user: { id: string; email: string; displayName: string | null };
  profileSummary: string | null;
  gradYear: number | null;
  grade: string | null;
} | { user: null };  // anonymous
```

- [ ] **Step 2: Write the failing tests**

In `apps/api/tests/integration/me-route.test.ts`, add (reuse the file's `withUser`, `db`, `schema`, `resetAllTables`, and its `seedUser` helper if present; otherwise insert a user inline). These assume a `makeApp(user)` style; match the file's existing pattern:
```typescript
  it('GET /api/me returns the grade for a user with a grad year', async () => {
    const [u] = await db
      .insert(schema.users)
      .values({ email: 'g@test.com', clerkUserId: 'clerk_g', displayName: null, gradYear: 2029 })
      .returning({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName });
    const app = new Hono();
    app.use('*', withUser({ id: u!.id, email: u!.email, displayName: u!.displayName, gradYear: 2029 }));
    app.route('/', me);
    const res = await app.request('/api/me');
    const body = await res.json();
    expect(body.gradYear).toBe(2029);
    expect(body.grade).toBe('Sophomore');
  });

  it('PATCH /api/me/grade sets the grade (and 401 when anonymous)', async () => {
    const [u] = await db
      .insert(schema.users)
      .values({ email: 'p@test.com', clerkUserId: 'clerk_p', displayName: null })
      .returning({ id: schema.users.id, email: schema.users.email, displayName: schema.users.displayName });

    const anon = new Hono();
    anon.use('*', withUser(null));
    anon.route('/', me);
    expect((await anon.request('/api/me/grade', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: '{}' })).status).toBe(401);

    const app = new Hono();
    app.use('*', withUser({ id: u!.id, email: u!.email, displayName: u!.displayName, gradYear: null }));
    app.route('/', me);
    const res = await app.request('/api/me/grade', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ grade: 'Senior' }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).grade).toBe('Senior');
    const [reloaded] = await db.select().from(schema.users).where(eq(schema.users.id, u!.id));
    expect(reloaded!.gradYear).toBe(2027);
  });
```
(Ensure `Hono`, `me`, `withUser`, `db`, `schema`, and `eq` are imported at the top of the file; add any that are missing.)

- [ ] **Step 3: Run, verify it fails**

Run: `cd apps/api && npm test -- tests/integration/me-route.test.ts`
Expected: FAIL — no grade fields / no PATCH route.

- [ ] **Step 4: Implement**

In `apps/api/src/routes/me.ts`:
- Update the imports at the top:
```typescript
import { Hono } from 'hono';
import { desc, eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { gradeFromGradYear, gradYearFromGrade } from '@composed-prompts/shared';
import { db, schema } from '../lib/db.js';
```
- Change the `GET /api/me` return to include the grade fields:
```typescript
  return c.json(
    {
      user: { id: user.id, email: user.email, displayName: user.displayName },
      profileSummary: profile?.summary ?? null,
      gradYear: user.gradYear,
      grade: gradeFromGradYear(user.gradYear),
    },
    200,
  );
```
- Add the PATCH route (place it after the `GET /api/me` handler):
```typescript
const GradePatchSchema = z.object({
  grade: z.enum(['Freshman', 'Sophomore', 'Junior', 'Senior']).nullable(),
});

me.patch('/api/me/grade', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  const body = await c.req.json().catch(() => ({}));
  const parsed = GradePatchSchema.safeParse(body);
  if (!parsed.success) return c.json({ error: 'invalid input' }, 400);

  const gradYear = parsed.data.grade === null ? null : gradYearFromGrade(parsed.data.grade);
  await db.update(schema.users).set({ gradYear }).where(eq(schema.users.id, user.id));
  return c.json({ gradYear, grade: gradeFromGradYear(gradYear) }, 200);
});
```

- [ ] **Step 5: Run, verify it passes**

Run: `cd apps/api && npm test -- tests/integration/me-route.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/api-contracts.ts apps/api/src/routes/me.ts apps/api/tests/integration/me-route.test.ts
git commit -m "feat(api): /api/me returns grade; PATCH /api/me/grade override"
```

---

## Task 8: Frontend — `apiPatch` + account-page grade display & override

**Files:** Modify `apps/web/lib/api-client.ts`, `apps/web/lib/use-api.ts`, `apps/web/app/account/page.tsx`

- [ ] **Step 1: Add `apiPatch` to the API client**

In `apps/web/lib/api-client.ts`, add a third function (mirrors `apiPost`):
```typescript
export async function apiPatch<TRes>(path: string, body: unknown, token?: string): Promise<TRes> {
  const res = await fetch(path, {
    method: 'PATCH',
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
```

- [ ] **Step 2: Expose it from `useApi`**

In `apps/web/lib/use-api.ts`, import `apiPatch` and add it to the returned object:
```typescript
import { apiGet, apiPost, apiPatch } from '@/lib/api-client';
```
and inside the `useMemo` return object, add:
```typescript
      apiPatch: async <T>(path: string, body: unknown): Promise<T> =>
        apiPatch<T>(path, body, (await getToken()) ?? undefined),
```

- [ ] **Step 3: Rebuild the account page**

Replace the entire contents of `apps/web/app/account/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useApi } from '@/lib/use-api';
import type { MeResponse } from '@composed-prompts/shared';

const GRADES = ['Freshman', 'Sophomore', 'Junior', 'Senior'] as const;

type MeView = { profileSummary: string | null; gradYear: number | null; grade: string | null };

export default function AccountPage() {
  const { isLoaded, isSignedIn, user } = useUser();
  const { apiGet, apiPatch } = useApi();
  const [me, setMe] = useState<MeView | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    apiGet<MeResponse>('/api/me')
      .then((d) => {
        if (d.user) setMe({ profileSummary: d.profileSummary, gradYear: d.gradYear, grade: d.grade });
      })
      .catch(() => setMe(null));
  }, [isLoaded, isSignedIn, apiGet]);

  const onGradeChange = async (value: string): Promise<void> => {
    const grade = value === '' ? null : value;
    const res = await apiPatch<{ gradYear: number | null; grade: string | null }>('/api/me/grade', { grade });
    setMe((prev) => (prev ? { ...prev, gradYear: res.gradYear, grade: res.grade } : prev));
  };

  if (!isLoaded) return <main className="mx-auto max-w-md px-6 py-16">Loading…</main>;
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
        <div>
          <dt className="text-slate-500">Grade</dt>
          <dd className="mt-1">
            {me?.grade ? (
              <span className="font-medium">{me.grade} · Class of {me.gradYear}</span>
            ) : (
              <span className="text-slate-500">
                We couldn&apos;t read your grade from your email — pick it below.
              </span>
            )}
            <select
              aria-label="Your grade"
              className="mt-2 block rounded border px-2 py-1"
              value={me?.grade ?? ''}
              onChange={(e) => onGradeChange(e.target.value)}
            >
              <option value="">Not set</option>
              {GRADES.map((g) => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </dd>
        </div>
        {me?.profileSummary && (
          <div>
            <dt className="text-slate-500">What we&apos;ve learned about your study style</dt>
            <dd className="mt-1 rounded border bg-white p-3 text-xs leading-relaxed">{me.profileSummary}</dd>
          </div>
        )}
      </dl>
      <p className="mt-8 text-xs text-slate-500">Manage your account from the avatar menu in the top-right.</p>
    </main>
  );
}
```

- [ ] **Step 4: Build**

Run: `cd apps/web && npm run build`
Expected: compiles; `/account` builds with no type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/api-client.ts apps/web/lib/use-api.ts apps/web/app/account/page.tsx
git commit -m "feat(web): account-page grade display + override dropdown"
```

---

## Task 9: Full verification

**Files:** none (verification)

- [ ] **Step 1: Shared tests**

Run: `cd packages/shared && npx vitest run`
Expected: all pass (grade, templates-shared, opus-full-prompt + existing).

- [ ] **Step 2: API tests**

Run: `cd apps/api && npm test`
Expected: all pass (users, me-route, generate, history + existing).

- [ ] **Step 3: Web build + tests**

Run: `cd apps/web && npm run build && npx vitest run`
Expected: build compiles; existing web tests pass.

- [ ] **Step 4: Final commit (incidental)**

```bash
git add -A
git commit -m "chore: verify grade detection (shared + api + web green)" --allow-empty
```

---

## Notes for the implementer

- **The migration is safe on the live DB** — a nullable `ADD COLUMN` is additive, non-breaking, and won't disturb the currently-deployed backend. No data clear, unlike the Clerk migration.
- **Anonymous users have no grade** — `gradeFromGradYear(undefined) → null`, the prompt line is omitted, and everything still works.
- **`OPUS_SYSTEM_PROMPT` must stay unchanged** (Task 3) so prompt caching holds — the grade goes only in the user message.
- **Reuse existing test fixtures** (`baseInputs`, `inputs`, `mockCreate`, `withUser`, `seedUser`) — match the variable names already in each file; don't invent new ones.
- **Detection only fills a null `grad_year`** so manual overrides and prior detection are never clobbered.
