# Material-Aware Prompting Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let the wizard capture what study material the student will attach to their own LLM, and engineer both the Opus and deterministic prompt paths to make that LLM extract the key topics from it and run active recall on them.

**Architecture:** Add one optional field `attachedMaterialKinds` to `WizardInputs`. A shared `material-kinds.ts` holds labels + a prose helper. The deterministic path enhances `buildMaterialSection`; the Opus path appends a directive to the user message (system prompt unchanged → prompt caching preserved). The frontend adds a toggle + chips to the Material step and an "attach reminder" on the result page. No uploads, no multimodal, no storage, no DB migration.

**Tech Stack:** TypeScript, Zod, Vitest (packages/shared), Next.js 14 (apps/web), Anthropic SDK.

**Spec:** `docs/superpowers/specs/2026-05-29-material-aware-prompting-design.md`

---

## File map

- **Modify** `packages/shared/src/types.ts` — `MaterialKind` type + `attachedMaterialKinds` on `WizardInputs`
- **Create** `packages/shared/src/material-kinds.ts` — `MATERIAL_KIND_LABELS`, `MATERIAL_KINDS`, `describeAttachedKinds()`
- **Create** `packages/shared/tests/unit/material-kinds.test.ts`
- **Modify** `packages/shared/src/index.ts` — export material-kinds
- **Modify** `packages/shared/src/validation/wizard-inputs.ts` — Zod field
- **Modify** `packages/shared/tests/unit/validation.test.ts` — cases
- **Modify** `packages/shared/src/templates/shared.ts` — `buildMaterialSection` attached case
- **Modify** `packages/shared/tests/unit/templates-shared.test.ts` — cases
- **Modify** `packages/shared/src/generation/opus-full-prompt.ts` — `buildUserMessage` directive
- **Modify** `packages/shared/tests/unit/opus-full-prompt.test.ts` — case
- **Modify** `apps/web/components/MaterialStep.tsx` — toggle + chips
- **Modify** `apps/web/app/wizard/page.tsx` — state + payload + sessionStorage
- **Modify** `apps/web/app/wizard/result/page.tsx` — attach reminder

---

## Task 1: Shared `MaterialKind` type + `material-kinds.ts` (TDD)

**Files:** Modify `packages/shared/src/types.ts`; Create `packages/shared/src/material-kinds.ts`, `packages/shared/tests/unit/material-kinds.test.ts`; Modify `packages/shared/src/index.ts`

- [ ] **Step 1: Add the type to `types.ts`**

In `packages/shared/src/types.ts`, after the `AssessmentType` union (line ~14), add:
```typescript
export type MaterialKind =
  | 'study-guide'
  | 'class-notes'
  | 'past-quiz'
  | 'textbook'
  | 'slides'
  | 'problem-set';
```
And inside `WizardInputs`, immediately after the `material?: string;` line, add:
```typescript
  // Step 5 (optional) — what the student will attach to their own LLM
  attachedMaterialKinds?: MaterialKind[];
```

- [ ] **Step 2: Write the failing test**

Create `packages/shared/tests/unit/material-kinds.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import {
  MATERIAL_KIND_LABELS,
  MATERIAL_KINDS,
  describeAttachedKinds,
} from '@composed-prompts/shared';

describe('material-kinds', () => {
  it('has a non-empty label for every kind', () => {
    expect(MATERIAL_KINDS.length).toBe(6);
    for (const k of MATERIAL_KINDS) {
      expect(MATERIAL_KIND_LABELS[k]).toBeTruthy();
    }
  });

  it('describes a kind list in prose', () => {
    expect(describeAttachedKinds([])).toBe('');
    expect(describeAttachedKinds(['study-guide'])).toBe('study guide');
    expect(describeAttachedKinds(['study-guide', 'past-quiz'])).toBe(
      'study guide and past quiz/test',
    );
    expect(describeAttachedKinds(['study-guide', 'past-quiz', 'slides'])).toBe(
      'study guide, past quiz/test, and slides',
    );
  });
});
```

- [ ] **Step 3: Run, verify it fails**

Run: `cd packages/shared && npx vitest run tests/unit/material-kinds.test.ts`
Expected: FAIL — cannot find `material-kinds` exports.

- [ ] **Step 4: Implement `material-kinds.ts`**

Create `packages/shared/src/material-kinds.ts`:
```typescript
import type { MaterialKind } from './types.js';

export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  'study-guide': 'Study guide',
  'class-notes': 'Class notes',
  'past-quiz': 'Past quiz/test',
  textbook: 'Textbook pages',
  slides: 'Slides',
  'problem-set': 'Problem set',
};

export const MATERIAL_KINDS = Object.keys(MATERIAL_KIND_LABELS) as MaterialKind[];

// Prose join for prompt phrasing, e.g. "study guide and past quiz/test".
export function describeAttachedKinds(kinds: MaterialKind[]): string {
  const labels = kinds.map((k) => MATERIAL_KIND_LABELS[k].toLowerCase());
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}
```

- [ ] **Step 5: Export from the barrel**

In `packages/shared/src/index.ts`, add after the `export * from './model-profiles.js';` line:
```typescript
export * from './material-kinds.js';
```
(`MaterialKind` is already exported via `export * from './types.js';`.)

- [ ] **Step 6: Run, verify it passes**

Run: `cd packages/shared && npx vitest run tests/unit/material-kinds.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/types.ts packages/shared/src/material-kinds.ts packages/shared/src/index.ts packages/shared/tests/unit/material-kinds.test.ts
git commit -m "feat(shared): MaterialKind type + labels + describeAttachedKinds"
```

---

## Task 2: Zod validation for `attachedMaterialKinds` (TDD)

**Files:** Modify `packages/shared/src/validation/wizard-inputs.ts`, `packages/shared/tests/unit/validation.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/shared/tests/unit/validation.test.ts`, add these inside the existing `describe('WizardInputsSchema', () => { ... })` block. The file already defines a valid fixture named `validInputs` at the top — reuse it:
```typescript
  it('accepts a valid attachedMaterialKinds array', () => {
    const r = WizardInputsSchema.safeParse({
      ...validInputs,
      attachedMaterialKinds: ['study-guide', 'past-quiz'],
    });
    expect(r.success).toBe(true);
  });

  it('rejects an unknown material kind', () => {
    const r = WizardInputsSchema.safeParse({
      ...validInputs,
      attachedMaterialKinds: ['notebook'],
    });
    expect(r.success).toBe(false);
  });

  it('rejects more than 6 material kinds', () => {
    const r = WizardInputsSchema.safeParse({
      ...validInputs,
      attachedMaterialKinds: [
        'study-guide', 'class-notes', 'past-quiz',
        'textbook', 'slides', 'problem-set', 'study-guide',
      ],
    });
    expect(r.success).toBe(false);
  });
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd packages/shared && npx vitest run tests/unit/validation.test.ts`
Expected: FAIL — the unknown-kind / >6 cases pass through because the field isn't validated yet (success true when expected false).

- [ ] **Step 3: Add the Zod field**

In `packages/shared/src/validation/wizard-inputs.ts`, inside the `WizardInputsSchema` `.object({...})`, after the `material: z.string().max(20000).optional(),` line, add:
```typescript
    attachedMaterialKinds: z
      .array(
        z.enum([
          'study-guide',
          'class-notes',
          'past-quiz',
          'textbook',
          'slides',
          'problem-set',
        ]),
      )
      .max(6)
      .optional(),
```

- [ ] **Step 4: Run, verify it passes**

Run: `cd packages/shared && npx vitest run tests/unit/validation.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/validation/wizard-inputs.ts packages/shared/tests/unit/validation.test.ts
git commit -m "feat(shared): validate attachedMaterialKinds (enum, max 6, optional)"
```

---

## Task 3: Deterministic `buildMaterialSection` attached case (TDD)

**Files:** Modify `packages/shared/src/templates/shared.ts`, `packages/shared/tests/unit/templates-shared.test.ts`

- [ ] **Step 1: Write the failing tests**

In `packages/shared/tests/unit/templates-shared.test.ts`, add these (the file already defines a `WizardInputs` fixture named `baseInputs` and already imports `buildMaterialSection` from `@composed-prompts/shared`):
```typescript
  it('builds an attach directive when material kinds are set', () => {
    const out = buildMaterialSection({ ...baseInputs, attachedMaterialKinds: ['study-guide'] });
    expect(out).toContain('I will attach my study guide');
    expect(out).toContain('extract the 6');
  });

  it('includes both attached and pasted material', () => {
    const out = buildMaterialSection({
      ...baseInputs,
      attachedMaterialKinds: ['study-guide'],
      material: 'my pasted notes',
    });
    expect(out).toContain('I will attach my study guide');
    expect(out).toContain('my pasted notes');
  });
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd packages/shared && npx vitest run tests/unit/templates-shared.test.ts`
Expected: FAIL — current `buildMaterialSection` ignores `attachedMaterialKinds`.

- [ ] **Step 3: Implement**

In `packages/shared/src/templates/shared.ts`, add the import near the top (after the existing imports):
```typescript
import { describeAttachedKinds } from '../material-kinds.js';
```
Replace the entire `buildMaterialSection` function with:
```typescript
export function buildMaterialSection(inputs: WizardInputs): string {
  const kinds = inputs.attachedMaterialKinds ?? [];
  const hasText = Boolean(inputs.material && inputs.material.trim().length > 0);

  if (kinds.length > 0) {
    const attach = `I will attach my ${describeAttachedKinds(kinds)} to you. Read it first, extract the 6-8 most important topics it covers, and base our session on those.`;
    return hasText ? `${attach}\n\nI've also pasted some material:\n${inputs.material!.trim()}` : attach;
  }
  if (hasText) {
    return inputs.material!.trim();
  }
  return 'I have shared no specific material — please ask me to share my notes, syllabus, or topic list if you need them to be effective.';
}
```

- [ ] **Step 4: Run, verify it passes**

Run: `cd packages/shared && npx vitest run tests/unit/templates-shared.test.ts`
Expected: PASS (including the prior tests in the file).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/templates/shared.ts packages/shared/tests/unit/templates-shared.test.ts
git commit -m "feat(shared): buildMaterialSection orchestrates attached material (deterministic path)"
```

---

## Task 4: Opus `buildUserMessage` directive (TDD)

**Files:** Modify `packages/shared/src/generation/opus-full-prompt.ts`, `packages/shared/tests/unit/opus-full-prompt.test.ts`

- [ ] **Step 1: Write the failing test**

In `packages/shared/tests/unit/opus-full-prompt.test.ts`, add a test (reuse the file's existing `inputs` fixture and `mockCreate` mock — the file already mocks the Anthropic client and inspects `mockCreate.mock.calls[0]![0]`):
```typescript
  it('adds an attach directive to the user message when kinds are set', async () => {
    mockCreate.mockResolvedValue({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await generateFullPromptWithOpus({ ...inputs, attachedMaterialKinds: ['study-guide'] });
    const call = mockCreate.mock.calls[0]![0];
    const userMsg = call.messages[0].content as string;
    expect(userMsg).toContain('will ATTACH');
    expect(userMsg).toContain('study guide');
  });
```
(If the mock fn has a different name in this file, match it. The existing model-assertion test in this file shows the exact pattern for reading `call`.)

- [ ] **Step 2: Run, verify it fails**

Run: `cd packages/shared && npx vitest run tests/unit/opus-full-prompt.test.ts`
Expected: FAIL — directive not present.

- [ ] **Step 3: Implement**

In `packages/shared/src/generation/opus-full-prompt.ts`, add the import near the top (after the existing relative imports):
```typescript
import { describeAttachedKinds } from '../material-kinds.js';
```
In `buildUserMessage`, in the `lines` array, immediately AFTER the `inputs.material ? ... : ...` ternary entry (the block ending with the `---` fenced material), add this new array element:
```typescript
    inputs.attachedMaterialKinds && inputs.attachedMaterialKinds.length > 0
      ? `The student will ATTACH the following to their own LLM when they study: ${describeAttachedKinds(inputs.attachedMaterialKinds)}. Write the Material and Interaction sections so the tutor first reads the attached material, extracts the key topics from it, and quizzes the student on those topics — do NOT assume that material text is inline in this prompt.`
      : '',
```
(The empty-string entries are collapsed by the existing run-of-empty-lines filter, so a no-op when kinds are absent.)

- [ ] **Step 4: Run, verify it passes**

Run: `cd packages/shared && npx vitest run tests/unit/opus-full-prompt.test.ts`
Expected: PASS (including the existing model/caching assertions — the system prompt is unchanged).

- [ ] **Step 5: Full shared suite + commit**

```bash
cd packages/shared && npx vitest run
```
Expected: all shared tests pass.
```bash
git add packages/shared/src/generation/opus-full-prompt.ts packages/shared/tests/unit/opus-full-prompt.test.ts
git commit -m "feat(shared): Opus user-message attach directive (system prompt unchanged)"
```

---

## Task 5: `MaterialStep` toggle + chips

**Files:** Modify `apps/web/components/MaterialStep.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `apps/web/components/MaterialStep.tsx`:
```tsx
'use client';

import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { MATERIAL_KINDS, MATERIAL_KIND_LABELS, type MaterialKind } from '@composed-prompts/shared';

const MAX = 20000;
const SOFT = 15000;

export function MaterialStep(props: {
  material: string;
  attachedMaterialKinds: MaterialKind[];
  onChange: (v: string) => void;
  onKindsChange: (kinds: MaterialKind[]) => void;
}) {
  const len = props.material.length;
  const selected = new Set(props.attachedMaterialKinds);

  const toggle = (k: MaterialKind): void => {
    const next = new Set(selected);
    if (next.has(k)) next.delete(k);
    else next.add(k);
    props.onKindsChange(MATERIAL_KINDS.filter((m) => next.has(m)));
  };

  return (
    <div className="grid gap-5">
      <div className="grid gap-2">
        <Label>Will you attach material to your AI when you study?</Label>
        <p className="text-sm text-slate-600">
          Attaching your own study guide or notes to ChatGPT/Claude makes a huge difference. Tell us
          what you&apos;ll attach and we&apos;ll build the prompt so your AI pulls the key topics out
          of it and quizzes you on them.
        </p>
        <div className="mt-1 flex flex-wrap gap-2">
          {MATERIAL_KINDS.map((k) => {
            const on = selected.has(k);
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggle(k)}
                aria-pressed={on}
                className={`rounded-full border px-3 py-1.5 text-sm transition ${
                  on
                    ? 'border-indigo-500 bg-indigo-600 text-white'
                    : 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                }`}
              >
                {MATERIAL_KIND_LABELS[k]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="grid gap-2">
        <Label htmlFor="material">Or paste material directly (optional)</Label>
        <Textarea
          id="material"
          value={props.material}
          onChange={(e) => props.onChange(e.target.value.slice(0, MAX))}
          placeholder="Paste topics or notes to bake straight into the prompt. This won't be stored anywhere."
          rows={8}
        />
        <div className="text-right text-xs text-slate-500">
          {len.toLocaleString()} / {MAX.toLocaleString()} characters
        </div>
        {len > SOFT && (
          <Alert>
            <AlertDescription>
              You&apos;re past {SOFT.toLocaleString()} characters. If your material is mostly noise
              (page numbers, headers), trimming improves prompt quality.
            </AlertDescription>
          </Alert>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit (build verified in Task 8)**

```bash
git add apps/web/components/MaterialStep.tsx
git commit -m "feat(web): MaterialStep attach toggle + kind chips"
```

---

## Task 6: Wizard page — carry `attachedMaterialKinds`

**Files:** Modify `apps/web/app/wizard/page.tsx`

- [ ] **Step 1: Pass the new props to `MaterialStep`**

In `apps/web/app/wizard/page.tsx`, find the `step === 4` block that renders `<MaterialStep .../>` and replace it with:
```tsx
        {step === 4 && (
          <MaterialStep
            material={inputs.material}
            attachedMaterialKinds={inputs.attachedMaterialKinds ?? []}
            onChange={(v) => update({ material: v })}
            onKindsChange={(kinds) => update({ attachedMaterialKinds: kinds })}
          />
        )}
```
(`update` already accepts `Partial<WizardInputs>`, and `attachedMaterialKinds` is part of `WizardInputs`, so no signature change is needed.)

- [ ] **Step 2: Include it in the submit payload**

In the same file, in the `submit` function where `payload` is built, add this line to the `payload` object (next to `material:`):
```tsx
      attachedMaterialKinds:
        inputs.attachedMaterialKinds && inputs.attachedMaterialKinds.length > 0
          ? inputs.attachedMaterialKinds
          : undefined,
```

- [ ] **Step 3: Store kinds in the result sessionStorage**

In the same file, find the `sessionStorage.setItem('pomfret.lastResult', JSON.stringify({ ...data, entryId: entry.id }))` call and replace it with:
```tsx
      sessionStorage.setItem(
        'pomfret.lastResult',
        JSON.stringify({
          ...data,
          entryId: entry.id,
          attachedMaterialKinds: payload.attachedMaterialKinds ?? [],
        }),
      );
```

- [ ] **Step 4: Commit (build verified in Task 8)**

```bash
git add apps/web/app/wizard/page.tsx
git commit -m "feat(web): wizard carries attachedMaterialKinds into payload + result"
```

---

## Task 7: Result page — attach reminder

**Files:** Modify `apps/web/app/wizard/result/page.tsx`

- [ ] **Step 1: Extend the stored-result type + import the helper**

In `apps/web/app/wizard/result/page.tsx`, add to the imports:
```tsx
import { describeAttachedKinds, type MaterialKind } from '@composed-prompts/shared';
```
In the `LastResult` type, add a field:
```tsx
  attachedMaterialKinds?: MaterialKind[];
```

- [ ] **Step 2: Render the reminder above the prompt**

In the returned JSX, immediately BEFORE the `<div className="mt-6"><PromptOutput .../></div>` block, add:
```tsx
      {data.attachedMaterialKinds && data.attachedMaterialKinds.length > 0 && (
        <Alert className="mt-4 border-indigo-200 bg-indigo-50">
          <AlertDescription className="text-indigo-900">
            Remember to attach your {describeAttachedKinds(data.attachedMaterialKinds)} to your AI
            when you paste this prompt — the prompt asks it to read your material first.
          </AlertDescription>
        </Alert>
      )}
```
(`Alert`/`AlertDescription` are already imported in this file.)

- [ ] **Step 2: Commit (build verified in Task 8)**

```bash
git add apps/web/app/wizard/result/page.tsx
git commit -m "feat(web): result-page reminder to attach material"
```

---

## Task 8: Full verification

**Files:** none (verification)

- [ ] **Step 1: Shared package tests**

Run: `cd packages/shared && npx vitest run`
Expected: all pass (includes the new material-kinds, validation, templates-shared, opus-full-prompt cases).

- [ ] **Step 2: API tests (regression — shared is bundled)**

Run: `cd apps/api && npm test`
Expected: all pass (no API changes; this confirms the shared edits didn't break generation/pipeline).

- [ ] **Step 3: Web build + tests**

Run: `cd apps/web && npm run build`
Expected: compiles; `/wizard` and `/wizard/result` build without type errors.
Run: `cd apps/web && npx vitest run`
Expected: existing web tests pass.

- [ ] **Step 4: Final commit (if anything incidental)**

```bash
git add -A
git commit -m "chore: verify material-aware prompting (shared + api + web green)" --allow-empty
```

---

## Notes for the implementer

- **No API/transport/DB changes.** `attachedMaterialKinds` rides along in the existing `/api/generate` JSON body and is fine to land in `generations.inputsJson` (non-sensitive). Do not add a migration.
- **Prompt caching is preserved** because the directive goes only in the Opus *user* message; `OPUS_SYSTEM_PROMPT` is untouched. Don't move it into the system prompt.
- **Reuse existing test fixtures** in each test file (`valid`/`base` in validation, `inputs` in templates-shared and opus-full-prompt) rather than inventing new ones; match the exact variable name the file uses.
- Frontend tasks (5–7) are verified by `npm run build` in Task 8, consistent with how the rest of the web app is tested.
