# Denial-of-Wallet Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All implementation subagents run on Opus (per user instruction).**

**Goal:** Make `POST /api/generate` un-bankruptable — close the rate-limit bypass, add a hard global Opus cap, and make the budget fail closed — so a determined attacker can cause at most a small, bounded Anthropic spend before everyone degrades to the free deterministic prompt.

**Architecture:** Five fixes in `apps/api` (+ one `makeClient` tweak in `packages/shared`). Reuse the existing `rate_limit_log` + `daily_spend` tables (no schema change). The controls become independent: budget-fails-closed handles a DB outage, the global call cap handles a DB-up flood, and an in-memory counter covers the gap.

**Tech Stack:** TypeScript, Hono, Drizzle/Postgres, Anthropic SDK, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-31-denial-of-wallet-hardening-design.md`

---

## File map

- **Create** `apps/api/src/lib/get-ip.ts` (trusted IP derivation) + `tests/unit/get-ip.test.ts`; **Modify** `apps/api/src/routes/generate.ts` (use it + per-user/anon keying) + `tests/integration/generate-route.test.ts`
- **Modify** `apps/api/src/lib/pipeline.ts` (global Opus cap) + `tests/unit/pipeline.test.ts`
- **Modify** `apps/api/src/lib/budget.ts` (fail closed) + `tests/unit/budget.test.ts`
- **Modify** `packages/shared/src/generation/opus-full-prompt.ts` (`maxRetries` + `timeout`)

**Note:** The DB-backed test files (`budget.test.ts`, `generate-route.test.ts`) require `DATABASE_URL` and truncate their tables in `beforeEach` — that is the existing project pattern for these files; run them as-is. The new `get-ip.test.ts` and the `pipeline.test.ts` changes are fully mocked (no DB). Do NOT run `tsc --noEmit` in `packages/shared` (known `TS6304`); `apps/api` `tsc --noEmit` is fine.

---

## Task 1: Trusted client IP (TDD)

**Files:** Create `apps/api/src/lib/get-ip.ts`, `apps/api/tests/unit/get-ip.test.ts`; Modify `apps/api/src/routes/generate.ts`

- [ ] **Step 1: Write the failing test**

Create `apps/api/tests/unit/get-ip.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { getIp } from '@/lib/get-ip';

const ctx = (headers: Record<string, string | undefined>) => ({
  req: { header: (k: string) => headers[k] },
});

describe('getIp', () => {
  it('prefers the unspoofable Fly-Client-IP', () => {
    expect(getIp(ctx({ 'fly-client-ip': '9.9.9.9', 'x-forwarded-for': '1.1.1.1, 2.2.2.2' }))).toBe('9.9.9.9');
  });

  it('falls back to the RIGHT-most x-forwarded-for entry (closest to the trusted edge)', () => {
    expect(getIp(ctx({ 'x-forwarded-for': '1.1.1.1, 2.2.2.2, 3.3.3.3' }))).toBe('3.3.3.3');
  });

  it('falls back to x-real-ip', () => {
    expect(getIp(ctx({ 'x-real-ip': '4.4.4.4' }))).toBe('4.4.4.4');
  });

  it("returns 'unknown' when no forwarding headers are present", () => {
    expect(getIp(ctx({}))).toBe('unknown');
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd apps/api && npx vitest run tests/unit/get-ip.test.ts`
Expected: FAIL — `@/lib/get-ip` not found.

- [ ] **Step 3: Implement**

Create `apps/api/src/lib/get-ip.ts`:
```typescript
type HeaderReader = { req: { header: (k: string) => string | undefined } };

// Derive the client IP from headers a client cannot spoof. Fly's proxy sets
// Fly-Client-IP at its edge (overwriting any client-supplied value); the
// RIGHT-most X-Forwarded-For entry is the hop closest to that trusted edge.
// Never trust the left-most X-Forwarded-For value — it is attacker-controlled.
export function getIp(c: HeaderReader): string {
  const flyIp = c.req.header('fly-client-ip');
  if (flyIp) return flyIp.trim();
  const fwd = c.req.header('x-forwarded-for');
  if (fwd) {
    const parts = fwd.split(',');
    return parts[parts.length - 1]!.trim();
  }
  return c.req.header('x-real-ip') ?? 'unknown';
}
```

- [ ] **Step 4: Wire it into the route**

In `apps/api/src/routes/generate.ts`, DELETE the local `getIp` definition (the `const getIp = (c: {...}) => {...}` block, currently lines 17-21), and add an import after the existing `import { hashIp } from '../lib/ip-hash.js';` line:
```typescript
import { getIp } from '../lib/get-ip.js';
```

- [ ] **Step 5: Run, verify it passes**

Run: `cd apps/api && npx vitest run tests/unit/get-ip.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/lib/get-ip.ts apps/api/tests/unit/get-ip.test.ts apps/api/src/routes/generate.ts
git commit -m "fix(api): derive client IP from unspoofable Fly-Client-IP (rate-limit bypass)"
```

---

## Task 2: Per-user + anonymous rate-limit keying (TDD)

**Files:** Modify `apps/api/src/routes/generate.ts`, `apps/api/tests/integration/generate-route.test.ts`

- [ ] **Step 1: Write the failing tests**

In `apps/api/tests/integration/generate-route.test.ts`, add an import for `hashIp` next to the existing imports (after `import { db, schema } from '@/lib/db';`):
```typescript
import { hashIp } from '@/lib/ip-hash';
```
Then add these two tests inside the `describe('POST /api/generate', ...)` block (after the existing `'attaches userId when authenticated'` test):
```typescript
  it('keys the rate limit on the IP (limit 20) for anonymous requests', async () => {
    await post(makeApp(), validBody); // header x-forwarded-for: '1.2.3.4'
    expect(mockCheckAndRecord).toHaveBeenCalledWith(`ip:${hashIp('1.2.3.4')}`, {
      limit: 20,
      windowSeconds: 86400,
    });
  });

  it('keys the rate limit on the user (limit 100) when authenticated', async () => {
    const [u] = await db
      .insert(schema.users)
      .values({ email: 'k@test.com', clerkUserId: 'clerk_k', displayName: null })
      .returning({ id: schema.users.id });
    const app = new Hono();
    app.use('*', withUser({ id: u!.id, email: 'k@test.com', displayName: null }));
    app.route('/', generate);
    await app.request('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
      body: JSON.stringify(validBody),
    });
    expect(mockCheckAndRecord).toHaveBeenCalledWith(`user:${u!.id}`, {
      limit: 100,
      windowSeconds: 86400,
    });
  });
```

- [ ] **Step 2: Run, verify they fail**

Run: `cd apps/api && npx vitest run tests/integration/generate-route.test.ts`
Expected: FAIL — the anonymous test fails (current limit constant is read but the bucket/limit pairing differs once authed-keying is added; the authed test fails because the route currently always keys on `ip:`). (If both currently pass by coincidence, the authed one will still fail since today's route never produces a `user:` bucket.)

- [ ] **Step 3: Implement the keying**

In `apps/api/src/routes/generate.ts`:

Add the per-user limit constant right after the existing `RATE_LIMIT_PER_IP_PER_DAY` line:
```typescript
const RATE_LIMIT_PER_USER_PER_DAY = parseInt(process.env.RATE_LIMIT_PER_USER_PER_DAY ?? '100', 10);
```

Replace the current rate-limit block (the `const ip = getIp(c);` line through the `if (!limit.allowed) { return ... 429 }` block) with:
```typescript
  const authedUser = c.get('user');
  const ip = getIp(c);
  const rlBucket = authedUser ? `user:${authedUser.id}` : `ip:${hashIp(ip)}`;
  const rlLimit = authedUser ? RATE_LIMIT_PER_USER_PER_DAY : RATE_LIMIT_PER_IP_PER_DAY;
  const limit = await checkAndRecord(rlBucket, { limit: rlLimit, windowSeconds: 24 * 60 * 60 });
  if (!limit.allowed) {
    return c.json({ error: 'rate limit exceeded; try again tomorrow' }, 429);
  }
```

Then inside the `try { ... }` block below, DELETE the now-duplicate `const authedUser = c.get('user');` line (it's already declared above). Keep `const userId = authedUser?.id ?? null;` and everything else (the `ipHash: hashIp(ip)` reference still resolves — `ip` is in scope from above).

- [ ] **Step 4: Run, verify they pass**

Run: `cd apps/api && npx vitest run tests/integration/generate-route.test.ts`
Expected: PASS (all tests, including the two new keying tests and the existing 429/200/userId tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/routes/generate.ts apps/api/tests/integration/generate-route.test.ts
git commit -m "fix(api): per-user (100) + anonymous-IP (20) rate-limit keying"
```

---

## Task 3: Hard global Opus call cap (TDD)

**Files:** Modify `apps/api/src/lib/pipeline.ts`, `apps/api/tests/unit/pipeline.test.ts`

- [ ] **Step 1: Write the failing tests**

In `apps/api/tests/unit/pipeline.test.ts`:

Add `mockCheckAndRecord` to the hoisted mocks and mock the rate-limit module. Change the `vi.hoisted` block and add the `vi.mock` so the top of the file reads:
```typescript
const { mockGenerateOpus, mockBudgetCheck, mockBudgetRecord, mockCheckAndRecord } = vi.hoisted(() => ({
  mockGenerateOpus: vi.fn(),
  mockBudgetCheck: vi.fn(),
  mockBudgetRecord: vi.fn(),
  mockCheckAndRecord: vi.fn(),
}));

vi.mock('@composed-prompts/shared/src/generation/opus-full-prompt.js', () => ({
  generateFullPromptWithOpus: mockGenerateOpus,
}));

vi.mock('@/lib/budget', () => ({
  budgetAvailable: mockBudgetCheck,
  recordSpend: mockBudgetRecord,
}));

vi.mock('@/lib/rate-limit', () => ({ checkAndRecord: mockCheckAndRecord }));

import { runPipeline, __resetGlobalOpusCounter } from '@/lib/pipeline';
```

In the existing `beforeEach`, add the new mock default and reset the global counter (so the in-memory backstop doesn't leak across tests):
```typescript
  beforeEach(() => {
    mockGenerateOpus.mockReset();
    mockBudgetCheck.mockReset();
    mockBudgetRecord.mockReset();
    mockCheckAndRecord.mockReset();
    mockBudgetCheck.mockResolvedValue(true);
    mockBudgetRecord.mockResolvedValue(undefined);
    mockCheckAndRecord.mockResolvedValue({ allowed: true, remaining: 100 });
    __resetGlobalOpusCounter();
    delete process.env.GLOBAL_OPUS_CALLS_PER_DAY;
  });
```

Add these two tests inside the `describe('runPipeline', ...)` block:
```typescript
  it('falls back to deterministic when the global Opus DB cap is exceeded', async () => {
    mockCheckAndRecord.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const r = await runPipeline(inputs);
    expect(r.generator).toBe('deterministic');
    expect(r.fallbackReason).toBe('budget-exhausted');
    expect(mockGenerateOpus).not.toHaveBeenCalled();
  });

  it('falls back to deterministic once the in-memory global cap is hit', async () => {
    process.env.GLOBAL_OPUS_CALLS_PER_DAY = '1';
    mockGenerateOpus.mockResolvedValue({
      ok: true,
      prompt: 'OPUS',
      usage: { input_tokens: 10, output_tokens: 20 },
    });
    const first = await runPipeline(inputs);
    expect(first.generator).toBe('opus'); // 1st call reserves the only slot
    const second = await runPipeline(inputs);
    expect(second.generator).toBe('deterministic'); // in-memory backstop blocks
    expect(second.fallbackReason).toBe('budget-exhausted');
    expect(mockGenerateOpus).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run, verify they fail**

Run: `cd apps/api && npm test -- tests/unit/pipeline.test.ts`
Expected: FAIL — `__resetGlobalOpusCounter` is not exported; the global-cap tests fail (no cap exists yet).

- [ ] **Step 3: Implement the global cap**

In `apps/api/src/lib/pipeline.ts`:

Add an import after the existing `import { budgetAvailable, recordSpend } from './budget.js';`:
```typescript
import { checkAndRecord } from './rate-limit.js';
```

Add these helpers after the `estimateOpusSpendUsd` definition (before `runPipeline`):
```typescript
const globalOpusCap = (): number => {
  const n = parseInt(process.env.GLOBAL_OPUS_CALLS_PER_DAY ?? '250', 10);
  return Number.isFinite(n) && n > 0 ? n : 250;
};

const utcDay = (): string => {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
};

// DB-independent per-process backstop: bounds Opus spend even if every DB
// control fails open. Resets on UTC-day rollover.
const inMemoryGlobalOpus = { day: '', count: 0 };
function reserveGlobalOpusSlot(): boolean {
  const day = utcDay();
  if (inMemoryGlobalOpus.day !== day) {
    inMemoryGlobalOpus.day = day;
    inMemoryGlobalOpus.count = 0;
  }
  if (inMemoryGlobalOpus.count >= globalOpusCap()) return false;
  inMemoryGlobalOpus.count += 1;
  return true;
}

// Test helper.
export function __resetGlobalOpusCounter(): void {
  inMemoryGlobalOpus.day = '';
  inMemoryGlobalOpus.count = 0;
}
```

Replace the body of `runPipeline` (from `const budgetOk = await budgetAvailable();` down to the `}` that closes the `if (budgetOk) { ... } else { ... }` block) with:
```typescript
  const budgetOk = await budgetAvailable();
  let fallbackReason: PipelineResult['fallbackReason'];

  // Gate Opus on: dollar budget (fails closed) AND the in-memory backstop AND
  // the DB-backed global daily call cap. Any miss → deterministic fallback.
  let opusAllowed = budgetOk;
  if (opusAllowed && !reserveGlobalOpusSlot()) opusAllowed = false;
  if (opusAllowed) {
    const g = await checkAndRecord(`global:opus:${utcDay()}`, { limit: globalOpusCap(), windowSeconds: 86400 });
    if (!g.allowed) opusAllowed = false;
  }

  if (opusAllowed) {
    const rag = await fetchRagContext({ userId: opts.userId, courseId: inputs.courseId, mode: inputs.mode });
    const ragText = buildRagContext(rag);
    const result = await generateFullPromptWithOpus(inputs, ragText, opts.studentGrade);
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
```
(The deterministic-fallback block below — `const prompt = assembleDeterministicPrompt(...)` through the `return {...}` — stays unchanged.)

- [ ] **Step 4: Run, verify they pass**

Run: `cd apps/api && npm test -- tests/unit/pipeline.test.ts`
Expected: PASS (all, including the existing opus/budget-exhausted/api-error tests and the two new global-cap tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/pipeline.ts apps/api/tests/unit/pipeline.test.ts
git commit -m "fix(api): hard global daily Opus cap (DB + in-memory backstop)"
```

---

## Task 4: Budget fails CLOSED (TDD)

**Files:** Modify `apps/api/src/lib/budget.ts`, `apps/api/tests/unit/budget.test.ts`

- [ ] **Step 1: Write the failing test**

In `apps/api/tests/unit/budget.test.ts`, add a `vi` import and a `db` import at the top:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { budgetAvailable, recordSpend, resetForTests } from '@/lib/budget';
import { db } from '@/lib/db';
```
Add this test inside the `describe('daily budget cap', ...)` block:
```typescript
  it('fails CLOSED (returns false) when the DB query throws', async () => {
    const spy = vi.spyOn(db, 'select').mockImplementation(() => {
      throw new Error('db down');
    });
    expect(await budgetAvailable()).toBe(false);
    spy.mockRestore();
  });
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd apps/api && npm test -- tests/unit/budget.test.ts`
Expected: FAIL — current `budgetAvailable` catch returns `true`, so the assertion `toBe(false)` fails.

- [ ] **Step 3: Implement (fail closed)**

In `apps/api/src/lib/budget.ts`, in `budgetAvailable`, change the catch block's return from `true` to `false` and update the log message:
```typescript
  } catch (err) {
    console.error('[budget] check failed, failing CLOSED (deterministic only)', { message: err instanceof Error ? err.message : String(err) });
    return false;
  }
```

- [ ] **Step 4: Run, verify it passes**

Run: `cd apps/api && npm test -- tests/unit/budget.test.ts`
Expected: PASS (the new fail-closed test + the existing under/over-ceiling tests).

- [ ] **Step 5: Commit**

```bash
git add apps/api/src/lib/budget.ts apps/api/tests/unit/budget.test.ts
git commit -m "fix(api): budget cap fails CLOSED on DB error (no surprise Opus spend)"
```

---

## Task 5: Anthropic client retry + timeout cap

**Files:** Modify `packages/shared/src/generation/opus-full-prompt.ts`

- [ ] **Step 1: Cap retries + add a timeout**

In `packages/shared/src/generation/opus-full-prompt.ts`, in `makeClient`, change the `opts` line:
```typescript
  const opts = { apiKey: process.env.ANTHROPIC_API_KEY };
```
to:
```typescript
  const opts = { apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 1, timeout: 30000 };
```
(So a single user request can't fan out into multiple billable attempts or hang a Fly worker. The rest of `makeClient` is unchanged — the `typeof opts` casts still hold.)

- [ ] **Step 2: Confirm shared + the opus test still pass**

Run: `cd packages/shared && npx vitest run tests/unit/opus-full-prompt.test.ts`
Expected: PASS (the test mocks the Anthropic client, so the new opts don't change its behavior).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/generation/opus-full-prompt.ts
git commit -m "fix(shared): cap Anthropic client maxRetries=1 + 30s timeout"
```

---

## Task 6: Full verification

**Files:** none

- [ ] **Step 1: Run the touched test files**

```bash
cd apps/api && npm test -- tests/unit/get-ip.test.ts tests/unit/pipeline.test.ts tests/unit/budget.test.ts tests/integration/generate-route.test.ts
cd packages/shared && npx vitest run
```
Expected: all pass.

- [ ] **Step 2: Type-check the backend**

Run: `cd apps/api && npx tsc --noEmit`
Expected: no errors. (Do NOT run `tsc --noEmit` in `packages/shared`.)

- [ ] **Step 3: Confirm a clean tree**

Run: `git status --short`
Expected: empty.

- [ ] **Step 4: [MANUAL, after `fly deploy`]**

Both rate-limiting and generation run in the `apps/api` backend, so this needs a **`fly deploy`** (Vercel is not involved). Optional set the new caps as Fly secrets if you want non-defaults: `RATE_LIMIT_PER_USER_PER_DAY`, `RATE_LIMIT_PER_IP_PER_DAY`, `GLOBAL_OPUS_CALLS_PER_DAY`. Sanity: a normal generation still returns a prompt; the spoof loop (`-H 'x-forwarded-for: <random>'`) no longer bypasses the cap (it now keys on the real Fly-Client-IP).

---

## Notes for the implementer

- **No schema change** — `rate_limit_log` + `daily_spend` already exist; the global cap reuses `checkAndRecord` with a fixed `global:opus:<utc-day>` bucket.
- **The controls are intentionally layered/independent:** budget-fails-closed (Task 4) blocks Opus on a DB outage; the global DB cap + in-memory backstop (Task 3) bound a DB-up flood. Don't "simplify" by removing one.
- **`get-ip.ts` is a pure function** (no DB import) so its unit test is fast and DB-free.
- The DB-backed tests (`budget.test.ts`, `generate-route.test.ts`) truncate their tables in `beforeEach` — existing project behavior; run them as-is with `DATABASE_URL` set.
- Watch for stray untracked files; do NOT create shims.
