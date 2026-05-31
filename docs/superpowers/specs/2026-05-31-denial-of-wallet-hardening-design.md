# Denial-of-Wallet Hardening — Design Spec

**Date:** 2026-05-31
**Status:** Approved (brainstorming) → ready for implementation plan
**Product:** Composed (Pomfret study-prompt generator)

## Context

A security audit found one serious cluster on the production app: the expensive `POST /api/generate` path (Claude Opus, ≈$0.07/call) has bypassable cost controls — a **denial-of-wallet** vector an anonymous attacker can exploit for unbounded Anthropic spend:

- The per-IP rate limit keys on the **left-most `x-forwarded-for`** token, which the client controls — rotate it per request → a fresh bucket every time → the 20/day cap never trips.
- The daily budget cap **fails open** on any DB error (returns "budget available"), and the rate limiter shares the same DB and also fails open — so a Postgres blip (which a flood would *cause*) removes both controls at once. The two backstops are not independent.
- There is **no hard global cap**, the dollar check is racy (check-then-spend), and the advertised per-user limit (`RATE_LIMIT_PER_USER_PER_DAY`) was never actually implemented.

The rest of the app audited clean: no IDOR, strong Zod validation + parameterized SQL, no secret leakage to clients, allow-listed CORS, graceful Opus→deterministic degradation.

**Policy decision (settled):** keep anonymous generation (preserve the "no accounts, use it freely" identity) but cap it hard.

## Goal

Make `/api/generate` un-bankruptable: a determined attacker (anonymous, header-spoofing, botnet, or concurrent) can cause at most a **bounded, small** Anthropic spend before everyone degrades to the free deterministic prompt — with no change to the legitimate user experience.

## Non-goals

- No requiring sign-in for generation (keep anonymous).
- No schema changes (reuse `rate_limit_log` + `daily_spend`).
- No frontend changes.
- Not fixing the lower-priority audit items here (prompt-injection delimiting, feedback-user binding, `authorizedParties` pinning, the material 8KB/20KB cap mismatch, log scrubbing) — deferred to a separate pass.

## Decisions (settled in brainstorming)

- Keep anonymous; cap hard.
- Cap values: **100/user/day, 20/anonymous-IP/day, ~250 global Opus calls/day** (all env-overridable).
- `Fly-Client-IP` is the trusted IP source — Fly's proxy sets it at its edge and overwrites any client-supplied value, so it cannot be spoofed.

## Design

The fix makes the controls **independent** so they don't fail together: budget-fails-closed handles a DB outage (→ deterministic, no Opus), the global call cap handles a DB-up botnet/concurrency flood, and a DB-independent in-memory counter covers the gap where the DB is up but a query intermittently fails.

### 1. Trusted client IP (C1) — `apps/api/src/routes/generate.ts`

Replace `getIp` to derive the IP from headers a client cannot spoof:
```ts
const getIp = (c) => {
  const flyIp = c.req.header('fly-client-ip');
  if (flyIp) return flyIp.trim();
  const fwd = c.req.header('x-forwarded-for');
  if (fwd) { const parts = fwd.split(','); return parts[parts.length - 1]!.trim(); }
  return c.req.header('x-real-ip') ?? 'unknown';
};
```
`Fly-Client-IP` first (trusted edge header); else the **right-most** `X-Forwarded-For` hop (closest to the trusted edge); else `x-real-ip`; else `'unknown'`.

### 2. Per-user + anonymous caps (C4) — `apps/api/src/routes/generate.ts`

Key the limit on the authenticated user when present, else the (now-trusted) IP:
```ts
const user = c.get('user');
const bucket = user ? `user:${user.id}` : `ip:${hashIp(getIp(c))}`;
const dailyLimit = user ? PER_USER_PER_DAY : PER_IP_PER_DAY; // 100 vs 20
const limit = await checkAndRecord(bucket, { limit: dailyLimit, windowSeconds: 24 * 60 * 60 });
```
New env `RATE_LIMIT_PER_USER_PER_DAY` (default 100); keep `RATE_LIMIT_PER_IP_PER_DAY` (default 20). Accountable identities get headroom; the unaccountable anonymous path is tighter.

### 3. Hard global Opus call cap (C3) — `apps/api/src/lib/pipeline.ts`

Before calling Opus (and only when budget is OK), gate on BOTH:
- **In-memory backstop** (DB-independent): a module-level `{ day, count }` reset on UTC-day change; block Opus when `count >= GLOBAL_OPUS_CALLS_PER_DAY`. Increment on each Opus call.
- **DB cap**: `checkAndRecord('global:opus:' + <utc-day>, { limit: GLOBAL_OPUS_CALLS_PER_DAY, windowSeconds: 86400 })`.

New env `GLOBAL_OPUS_CALLS_PER_DAY` (default 250 ≈ $17 worst case). If either backstop is exceeded → deterministic fallback (`fallbackReason: 'budget-exhausted'`). This bounds worst-case spend regardless of how IPs/users are distributed.

### 4. Budget fails CLOSED (C2/H2) — `apps/api/src/lib/budget.ts`

`budgetAvailable()`'s catch returns **`false`** (deny Opus → deterministic) instead of `true`. Pipeline checks budget first, so a DB error blocks Opus entirely (students still get the free deterministic prompt). Keep logging `recordSpend` failures (at warn) for visibility, since the global call cap + in-memory backstop now bound spend even if the dollar accounting drifts.

### 5. Anthropic client hardening (M5) — `packages/shared/src/generation/opus-full-prompt.ts`

In `makeClient`, pass `maxRetries: 1` and a `timeout` (30000 ms) so one request can't fan out into multiple billable attempts or hang a Fly worker.

## Error handling / edge cases

- Every new gate falls through to the deterministic generator — the user always gets a prompt.
- UTC-day rollover resets both the in-memory and DB global caps (consistent with `daily_spend` / `todayKey()`).
- `Fly-Client-IP` absent (local dev / non-Fly) → falls back to XFF/x-real-ip/'unknown' (unchanged dev behavior).
- In-memory counter is per-process: on multi-machine Fly scale-out each machine has its own counter (still bounded per machine); under normal single-machine load it's a true global cap.

## Testing

`apps/api` (Vitest):
- `getIp`: prefers `Fly-Client-IP`; falls back to the right-most `X-Forwarded-For` entry; then `x-real-ip`; then `'unknown'`.
- `budgetAvailable`: returns `false` when the DB query throws (fails closed).
- Global cap: `runPipeline` returns `generator: 'deterministic'` + `fallbackReason: 'budget-exhausted'` once the global daily count is exceeded.
- `/api/generate` keying: authed → `user:<id>` bucket at 100; anonymous → `ip:<hash>` bucket at 20. Update the existing `generate-route.test.ts` rate-limit mock.
- The Anthropic `maxRetries`/`timeout` is config — covered by the existing opus tests still passing.

## Files touched

- `apps/api/src/routes/generate.ts` (trusted `getIp` + per-user/anon keying)
- `apps/api/src/lib/budget.ts` (fail closed)
- `apps/api/src/lib/pipeline.ts` (global DB cap + in-memory backstop)
- `packages/shared/src/generation/opus-full-prompt.ts` (`maxRetries` + `timeout`)
- tests under `apps/api/tests/`

## Future (deferred audit items)

Prompt-injection delimiting of `material`/RAG, binding feedback to the authed user, `authorizedParties` pinning on `verifyToken`, the material 8KB/20KB cap mismatch, structured/scrubbed logging, and the Clerk dev→prod migration (gated on a custom domain).
