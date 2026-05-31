# Sharpen: Multi-Model Prompt Refinement — Design Spec

**Date:** 2026-05-31
**Status:** Approved (brainstorming) → ready for implementation plan
**Product:** Composed (Pomfret study-prompt generator)

## Context

Composed generates a study prompt with a single model (Opus 4.8). The idea: let a student opt into a **second frontier model** sharpening the prompt — Opus 4.8 writes it, GPT-5.5-thinking critiques it, Opus revises. Two different model families catch different blind spots, yielding a better final prompt. This is a premium, opt-in refinement — the base generation is unchanged.

## Goal

Add an opt-in, signed-in **"Sharpen"** action on the result page that runs a GPT-5.5-thinking critique → Opus-4.8 revise on the already-generated prompt and returns a measurably better prompt (plus the critique), without touching the fast, free, anonymous base flow.

## Non-goals

- Not the default — base generation stays single-model Opus, fast and anonymous.
- No dual-write/merge or multi-round debate (rejected: author+critic is simpler and captures the cross-model benefit).
- No user-facing effort selector (effort defaults to max, env-tunable).
- No schema change (reuse `generations` + `daily_spend` + `rate_limit_log`).
- Composed still does not *store* student material (it flows through transiently, same as base generation).

## Decisions (settled in brainstorming)

- **Opt-in deep mode**, triggered from the **result page** (reuses the base prompt — no wasted call).
- **Author + critic flow:** Opus 4.8 authors → GPT-5.5-thinking critiques → Opus 4.8 revises → final.
- **Signed-in only**, per-user capped.
- **Effort:** both models default to **max** reasoning, **env-configurable** (no UI knob).

## Design

### 1. New provider: OpenAI critic — `apps/api/src/lib/openai.ts`

Add the `openai` SDK + `OPENAI_API_KEY` (Fly secret). Export:
```ts
export class CritiqueError extends Error {}
export async function critiquePromptWithGpt(
  basePrompt: string,
  context: { courseLabel: string; mode: string; assessmentType: string },
): Promise<string>; // returns the critique text
```
Calls `gpt-5-5-thinking` with `reasoning_effort: SHARPEN_GPT_EFFORT` (default `"high"`) and a critic system prompt: *"You are a prompt-engineering critic. Here is a study prompt another AI wrote for a Pomfret student, plus their situation. List concrete, specific weaknesses and what would sharpen it — name actual gaps, don't be generic. Critique only; do NOT rewrite the prompt."* Throws `CritiqueError` on auth/other failure. The exact SDK shape for `reasoning_effort` is confirmed against the installed `openai` version at build.

### 2. Opus revise — `packages/shared/src/generation/revise-prompt.ts`

```ts
export async function revisePromptWithOpus(
  basePrompt: string,
  critique: string,
  inputs: WizardInputs,
  studentGrade?: string,
): Promise<OpusFullPromptResult>; // same result shape as generateFullPromptWithOpus
```
Reuses the existing Anthropic client (`makeClient`) with `thinking: { type: 'enabled', budget_tokens: SHARPEN_OPUS_THINKING_BUDGET }` (default ~8000). A revise system prompt: *"Here is a study prompt you wrote plus an external critique of it. Produce an improved version that fixes the valid points, keeps the 7-section Pomfret-Study framework and the same output format the student's LLM wants, and stays a clean copy-paste prompt. Output only the improved prompt."* The exact `thinking` param shape is confirmed against the installed `@anthropic-ai/sdk` version at build (note: this is the first use of extended thinking in the codebase). Export from the shared barrel.

### 3. Route — `apps/api/src/routes/sharpen.ts` (`POST /api/generate/sharpen`)

- **Auth:** 401 if `!c.get('user')`.
- **Body:** `{ generationId: string; basePrompt: string }`; reject if `basePrompt` > 20000 chars.
- **Per-user cap:** `checkAndRecord('sharpen:user:<id>', { limit: SHARPEN_PER_USER_PER_DAY (10), windowSeconds: 86400 })` → 429 when exceeded.
- **Budget gate:** `budgetAvailable()` (fails closed) + the global Opus cap (the revise is an Opus call); if blocked → 200 `{ ok: false, reason: 'unavailable' }` (the client keeps the base prompt).
- **Context:** load the `generations` row by `generationId` for `courseLabel`/`mode`/`assessmentType` + the (redacted-material) `inputs_json` to pass `inputs` into the revise. Best-effort; fall back to minimal context if the row is missing.
- **Flow:** `critiquePromptWithGpt(basePrompt, context)` → `revisePromptWithOpus(basePrompt, critique, inputs, grade)`. On `CritiqueError` or Opus failure → 200 `{ ok: false, reason: 'critic-failed' | 'revise-failed' }`.
- **Spend:** fold the estimated GPT cost into `daily_spend` (recordSpend) in addition to the Opus revise spend.
- **Store:** insert a redacted `generations` row for the sharpened prompt (reuse existing columns; `generator: 'opus'`, material scrubbed) so history + the learning system include it. **No schema change.**
- **Return:** 200 `{ ok: true, improvedPrompt: string, critique: string }`.
- Mount in `apps/api/src/index.ts`.

### 4. Contract — `packages/shared/src/api-contracts.ts`
```ts
export type SharpenRequest = { generationId: string; basePrompt: string };
export type SharpenResponse =
  | { ok: true; improvedPrompt: string; critique: string }
  | { ok: false; reason: 'unavailable' | 'critic-failed' | 'revise-failed' };
```

### 5. Result-page UI — `apps/web/app/wizard/result/page.tsx` (+ a `SharpenPanel` component)

- **Signed-in:** a "Sharpen with a 2nd model" button under the prompt. On click → loading ("A second model is critiquing & sharpening — about 30 seconds") → on `ok` show the improved prompt in place of the base, with a **"See original"** toggle and a **collapsed "What the 2nd model flagged"** showing the critique. On `ok:false` → a small "Couldn't sharpen right now — your prompt above is still solid" note (base unchanged).
- **Signed-out** (`<SignedOut>`): the button reads "Sign in to sharpen with a 2nd model" → Clerk sign-in.
- Calls `apiPost<SharpenResponse>('/api/generate/sharpen', { generationId, basePrompt })` with the values from `sessionStorage` `pomfret.lastResult`.

### 6. Material posture
The base prompt may embed the student's pasted material. Opus already processes that material transiently during base generation; Sharpen is the same posture — GPT + Opus see it transiently for the refinement, and the stored sharpened row is material-redacted. No material is persisted by Sharpen.

## Environment variables
- `OPENAI_API_KEY` (secret) — required for Sharpen; absent → the critic throws and the route returns `{ ok: false }` gracefully.
- `SHARPEN_PER_USER_PER_DAY` (default 10)
- `SHARPEN_OPUS_THINKING_BUDGET` (default 8000)
- `SHARPEN_GPT_EFFORT` (default `high`)

## Testing
- `packages/shared` (Vitest): `revisePromptWithOpus` — mocks the Anthropic client; asserts it passes the base prompt + critique + the `thinking` budget and returns the revised prompt; api-error path.
- `apps/api` (Vitest): `critiquePromptWithGpt` (mock the `openai` client — asserts `reasoning_effort` is set, returns the critique, throws `CritiqueError` on failure); `POST /api/generate/sharpen` (mock the critic + revise + budget/rate): 401 anonymous; 429 over per-user cap; `{ ok:false, reason:'unavailable' }` when budget blocks; `{ ok:true, improvedPrompt, critique }` happy path; oversized `basePrompt` → 400.
- `apps/web`: build + type-check; the signed-in Sharpen flow verified manually (needs real Clerk).

## Files touched (summary)
- **Create:** `apps/api/src/lib/openai.ts`, `apps/api/src/routes/sharpen.ts`, `packages/shared/src/generation/revise-prompt.ts`, `apps/web/components/SharpenPanel.tsx`
- **Modify:** `apps/api/src/index.ts` (mount), `apps/api/package.json` (`openai` dep), `packages/shared/src/index.ts` + `api-contracts.ts`, `apps/web/app/wizard/result/page.tsx`
- Tests under `apps/api/tests/` and `packages/shared/tests/`

## Prerequisite (user action)
Create an OpenAI account + API key; set `OPENAI_API_KEY` as a Fly secret. (Build-time: add the `openai` npm dependency to `apps/api`.)

## Future
A user-facing effort selector, dual-write/merge mode, or extending Sharpen to non-Opus base generations — all deferred. The same critique→revise engine could later power a one-tap "Round 2" study-loop prompt.
