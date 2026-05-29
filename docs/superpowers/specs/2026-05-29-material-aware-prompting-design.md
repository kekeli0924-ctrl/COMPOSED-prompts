# Material-Aware Prompting — Design Spec

**Date:** 2026-05-29
**Status:** Approved (brainstorming) → ready for implementation plan
**Product:** Composed (Pomfret study-prompt generator)

## Problem & motivation

Composed generates a study prompt the student pastes into their *own* LLM (ChatGPT / Claude / Gemini). Today the wizard's Material step is a passive paste box: the generated prompt's "Material" section just embeds the pasted text, or says "no material provided." Two weaknesses:

1. **The prompt doesn't orchestrate the student's own material.** Most students have a real study guide, notes, or past quiz they could attach to their LLM, but the generated prompt doesn't tell the LLM to use it well.
2. **Uploading the material *to Composed* is redundant for a single session.** If the student attaches the file to their own LLM (which they should — the LLM reads it directly), Composed pre-reading it adds little. (Composed-side ingestion only earns its keep as the foundation for a future longitudinal study-flow that tracks per-topic knowledge across sessions — explicitly out of scope here.)

**This spec takes the lean, honest path: material-*aware* prompting with no upload to Composed.** The generated prompt instructs the student to attach their material to their own LLM and is engineered to make that LLM extract the key topics and run active recall on them.

## Goal

Make the generated prompt actively orchestrate the student's LLM to use the student's own attached material pedagogically — read it, extract the key topics, quiz on them with active recall — by capturing *what the student will attach* in the wizard and weaving it into both the Opus and deterministic prompt paths.

## Non-goals (explicitly out of scope)

- No file upload to Composed (no images, no PDFs, no multimodal Opus call).
- No file storage, no new privacy surface, no DB migration.
- No per-topic knowledge tracking / spaced review (that's the future study-flow build, for which Composed-side material ingestion would then be justified).

## Example: the behavior change

**Before** (Material section, passive): `I have shared no specific material — please ask me to share my notes…`

**After** (prompt orchestrates the student's LLM): *"I'm attaching my Unit 3 study guide. First, read it and list the 6–8 key topics it covers. Then quiz me on each, one at a time — wait for my answer, give a 1–2 sentence correction, and re-test anything I miss. Don't show answers until I respond."*

The student attaches the file to their LLM; Composed never sees it.

## Design

### 1. Shared contract (`packages/shared`)

- **`packages/shared/src/types.ts`** — add to `WizardInputs`:
  ```ts
  attachedMaterialKinds?: MaterialKind[];
  ```
  Add the type:
  ```ts
  export type MaterialKind =
    | 'study-guide' | 'class-notes' | 'past-quiz'
    | 'textbook' | 'slides' | 'problem-set';
  ```
  Empty/absent = student is not attaching anything. Keep existing `material?: string` (free-text paste).
- **Labels** — new file `packages/shared/src/material-kinds.ts` exporting `MATERIAL_KIND_LABELS: Record<MaterialKind, string>` →
  `study-guide: 'Study guide'`, `class-notes: 'Class notes'`, `past-quiz: 'Past quiz/test'`, `textbook: 'Textbook pages'`, `slides: 'Slides'`, `problem-set: 'Problem set'`.
- **Zod (`packages/shared/src/validation/wizard-inputs.ts`)** — add to both `WizardInputsSchema` (and `FeedbackPayloadSchema` does NOT need it):
  ```ts
  attachedMaterialKinds: z
    .array(z.enum(['study-guide','class-notes','past-quiz','textbook','slides','problem-set']))
    .max(6)
    .optional(),
  ```

### 2. Generation — Opus path

- **`packages/shared/src/generation/opus-full-prompt.ts`, `buildUserMessage(inputs)`** — when `attachedMaterialKinds` is non-empty, append a directive describing what the student will attach, instructing Opus to write the Material + Interaction sections so the tutor reads the attached material first, extracts the key topics, and quizzes on them (don't assume the material text is inline). Phrase using `MATERIAL_KIND_LABELS`.
- **`OPUS_SYSTEM_PROMPT` stays byte-for-byte identical** — the directive goes only in the user message, preserving prompt caching.

### 3. Generation — deterministic fallback

- **`packages/shared/src/templates/shared.ts`, `buildMaterialSection(inputs)`** — when `attachedMaterialKinds` is non-empty, return a directive like: *"I will attach my {labels}. Read them first, extract the 6–8 key topics, and base our session on those."* If `material` text is also present, include both. If neither, keep the current "no material provided" text.
- Because all five mode templates render the Material section through this single function (via the assembler), the change propagates to every mode with no per-template edits.

### 4. Frontend (`apps/web`)

- **`components/MaterialStep.tsx`** — keep the paste textarea; add a toggle *"Will you attach material to your AI when you study?"* and, when yes, a multi-select chip group of the six kinds. Reframe helper copy to sell attaching material. Call `onChange` with the new `attachedMaterialKinds`.
- **`app/wizard/page.tsx`** — add `attachedMaterialKinds` to `PartialWizardState`, the `update` handler, and the submit payload.
- **`app/wizard/result/page.tsx`** — when `attachedMaterialKinds` was set, show a one-line reminder near the prompt output: *"Remember to attach your study guide/notes when you paste this prompt."*

### Explicitly unchanged

- `/api/generate` route (`apps/api`) — the new field rides along in the existing JSON body; no route change.
- No transport/multimodal, no file storage, no DB migration.
- `attachedMaterialKinds` is non-sensitive, so it may be stored in `generations.inputsJson` (unlike the redacted free-text `material`).

## Testing

- **`packages/shared` (Vitest):**
  - Zod: accepts a valid `attachedMaterialKinds` array; rejects an unknown kind; rejects > 6.
  - `buildMaterialSection`: with kinds → returns the "read them first / extract topics" directive incl. the right labels; with kinds + pasted text → includes both; with neither → unchanged "no material provided".
  - `buildUserMessage` (Opus mocked): the user message includes the attached-material directive when kinds are set, and omits it when not. System prompt unchanged.
  - Existing assembler/template tests stay green.
- **`apps/web`:** existing unit tests stay green; `MaterialStep` verified via the manual/browser pass.

## Future (out of scope, noted for sequencing)

This is the lean v1 of the larger "make the prompt + study flow better" effort. Composed-side material ingestion (reading uploads to extract a persistent per-topic structure) is deferred to the **study-flow build** (debrief → per-topic knowledge state → spaced review), where ingesting material genuinely earns its keep because Composed — not the student's stateless LLM — is the part that persists across sessions.

## Files touched (summary)

- `packages/shared/src/types.ts` — `MaterialKind`, `attachedMaterialKinds`
- `packages/shared/src/material-kinds.ts` (new) — `MATERIAL_KIND_LABELS`
- `packages/shared/src/index.ts` — export the new type/labels
- `packages/shared/src/validation/wizard-inputs.ts` — Zod field
- `packages/shared/src/generation/opus-full-prompt.ts` — `buildUserMessage` directive
- `packages/shared/src/templates/shared.ts` — `buildMaterialSection` attached case
- `apps/web/components/MaterialStep.tsx` — toggle + chips
- `apps/web/app/wizard/page.tsx` — state + payload
- `apps/web/app/wizard/result/page.tsx` — attach reminder
- tests in `packages/shared/tests/unit/`
