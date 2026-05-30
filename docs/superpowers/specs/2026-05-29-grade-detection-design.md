# Grade Detection — Design Spec

**Date:** 2026-05-29
**Status:** Approved (brainstorming) → ready for implementation plan
**Product:** Composed (Pomfret study-prompt generator)

## Problem & motivation

Composed knows the student's course, mode, assessment, and self-rated confidence — but not their **grade level**. A sophomore and a senior in the same Honors Bio course need differently-pitched study sessions (rigor, scaffolding, study maturity). The student's Pomfret email already encodes their graduating class (e.g., `jdoe29@pomfret.org` → class of 2029), and the backend already stores that email — so the grade can be derived for free and used to sharpen the prompt.

## Goal

Automatically detect the student's grade from their Pomfret email, store it, inject it into the generated prompt's About-Me section, and surface it on the account page with a manual override for cases where auto-detection can't read it (e.g., personal-Gmail sign-in).

## Non-goals

- No change to the wizard or `WizardInputs`/Zod (grade is a *user* property, not a wizard input).
- No date-based rollover logic — a single constant anchors the mapping (see below).
- No "detected vs manual" source flag — a single `grad_year` column; detection only fills it when null, so a manual value always wins.

## The grade mapping (settled)

One constant anchors everything:

```
SENIOR_CLASS_GRAD_YEAR = 2027
```

`gradeNumber = 12 − (gradYear − 2027)` →

| Grad year | Grade # | Label |
|-----------|---------|-------|
| 2027 | 12 | Senior |
| 2028 | 11 | Junior |
| 2029 | 10 | Sophomore |
| 2030 | 9 | Freshman |

Grad years outside 2027–2030 (already graduated, e.g. `26`; not yet enrolled, e.g. `31`) → grade `null` (unknown). Bumping the constant by 1 each year keeps it current; no date logic.

## Design

### 1. Shared module — `packages/shared/src/grade.ts`

Pure, dependency-free functions (unit-tested):

```ts
export const SENIOR_CLASS_GRAD_YEAR = 2027;
export type Grade = 'Freshman' | 'Sophomore' | 'Junior' | 'Senior';

// Parse a Pomfret email's trailing 2-digit grad year, accepting only
// currently-enrolled classes (anchor .. anchor+3). Returns 4-digit year or null.
export function detectGradYear(email: string): number | null;

// 2027 -> 'Senior' ... 2030 -> 'Freshman'; outside 9..12 -> null.
export function gradeFromGradYear(gradYear: number | null | undefined): Grade | null;

// Inverse for the manual override: 'Senior' -> 2027 ... 'Freshman' -> 2030.
export function gradYearFromGrade(grade: Grade): number;
```

Detection rules (`detectGradYear`): lowercase + trim; require domain exactly `pomfret.org`; take the local part's **trailing run of digits**; accept only if it is exactly 2 digits AND `2000+digits` falls in `[SENIOR_CLASS_GRAD_YEAR, SENIOR_CLASS_GRAD_YEAR + 3]`; else `null`. Export the module from `packages/shared/src/index.ts`.

### 2. Data model + detection (`apps/api`)

- **`apps/api/src/schema.ts`** — add `gradYear: smallint('grad_year')` (nullable) to `users`.
- **Migration** — `npm run db:generate` produces a single `ADD COLUMN "grad_year" smallint` migration. It is **additive + nullable → non-interactive, non-breaking, safe to apply to the live Neon DB with no downtime and no data clear** (unlike the Clerk migration). Apply with `npm run db:migrate`.
- **`apps/api/src/lib/users.ts` (`getOrCreateUser`)** — return `gradYear` in the selected columns. On **insert**, set `gradYear: detectGradYear(profile.email)`. On an **existing** row whose `gradYear` is `null`, run `detectGradYear(existing.email)` once and `UPDATE` if it returns a value (lazy backfill for users provisioned before this feature). **Never overwrite a non-null `gradYear`** (protects manual overrides + already-detected values).

### 3. User context + prompt injection

- **`apps/api/src/middleware/clerk-auth.ts`** — extend the `ContextVariableMap` `user` type with `gradYear: number | null`, and set it from `getOrCreateUser`.
- **`apps/api/src/routes/generate.ts`** — compute `const studentGrade = gradeFromGradYear(c.get('user')?.gradYear ?? null) ?? undefined;` and pass it: `runPipeline(inputs, { userId, studentGrade })`.
- **`apps/api/src/lib/pipeline.ts` (`runPipeline`)** — accept `studentGrade?: string` in its opts and forward it to both generation paths.
- **`packages/shared/src/generation/opus-full-prompt.ts`** — `generateFullPromptWithOpus(inputs, ragContext = '', studentGrade?)`; `buildUserMessage(inputs, studentGrade?)` adds a line `Student's grade: ${studentGrade}` when present. `OPUS_SYSTEM_PROMPT` unchanged (caching preserved).
- **`packages/shared/src/generation/assembler.ts`** — `assembleDeterministicPrompt(inputs, studentGrade?)` forwards to the About-Me builder.
- **`packages/shared/src/templates/shared.ts` (`buildAboutMeSection`)** — accept optional `studentGrade` and push `- Grade: ${studentGrade}` when present.
- Anonymous users have no grade → the line is omitted everywhere. Purely additive.

### 4. Account display + manual override

- **`packages/shared/src/api-contracts.ts`** — the authed `MeResponse` shape gains `gradYear: number | null` and `grade: string | null`.
- **`apps/api/src/routes/me.ts`:**
  - `GET /api/me` returns `gradYear` + `grade` (`gradeFromGradYear(user.gradYear)`).
  - **New `PATCH /api/me/grade`** (authed; 401 if anonymous): body `{ grade: Grade | null }`, Zod-validated. Computes `gradYear = grade === null ? null : gradYearFromGrade(grade)`, writes `users.grad_year`, returns `{ gradYear, grade }`.
- **`apps/web/app/account/page.tsx`** — show *"Grade: Sophomore · Class of 2029"* when known; a dropdown (Freshman/Sophomore/Junior/Senior + a clear option) that calls `PATCH /api/me/grade` via the existing `useApi` hook and refreshes; when grade is `null`, a gentle nudge to set it.

## Privacy

`grad_year` is low-sensitivity (derived from the school email we already store). It may live in `users.grad_year` and be returned by `/api/me`. Not redacted.

## Testing

- **`packages/shared` (Vitest):** `grade.ts` — `detectGradYear` (valid `27/28/29/30`; personal Gmail → null; non-2-digit → null; out-of-window `26`/`31` → null; faculty `smith@pomfret.org` → null); `gradeFromGradYear` (each year → label; out-of-range → null; null → null); `gradYearFromGrade` round-trips. `buildAboutMeSection` includes the grade line when `studentGrade` is set, omits it otherwise. `buildUserMessage` includes the grade line when set (Opus mocked).
- **`apps/api` (Vitest, DB-backed):** `getOrCreateUser` sets `gradYear` from a `@pomfret.org` email on insert; leaves null for a personal email; backfills an existing null row; never overwrites a non-null value. `PATCH /api/me/grade` sets/clears the grade (401 anon). `GET /api/me` returns grade. Generate route attaches the grade into the prompt (via the existing `withUser` test stub with a `gradYear`).
- **`apps/web`:** build + type-check; existing tests stay green.

## Files touched (summary)

- `packages/shared/src/grade.ts` (new) + `index.ts` export
- `packages/shared/src/generation/opus-full-prompt.ts`, `generation/assembler.ts`, `templates/shared.ts` — `studentGrade` param
- `packages/shared/src/api-contracts.ts` — `MeResponse` fields
- `apps/api/src/schema.ts` + new migration
- `apps/api/src/lib/users.ts` — detection + backfill
- `apps/api/src/middleware/clerk-auth.ts` — `gradYear` on user context
- `apps/api/src/routes/generate.ts` — pass `studentGrade`
- `apps/api/src/lib/pipeline.ts` — thread `studentGrade`
- `apps/api/src/routes/me.ts` — return grade + `PATCH /api/me/grade`
- `apps/web/app/account/page.tsx` — display + override dropdown
- tests in `packages/shared/tests/unit/` and `apps/api/tests/integration/`

## Future (out of scope)

Grade becomes a useful input to the planned study-flow (seniors vs. underclassmen have different schedules/workloads) and to the Google Calendar feature (the next spec).
