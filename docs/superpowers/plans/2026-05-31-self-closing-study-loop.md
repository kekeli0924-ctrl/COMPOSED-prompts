# Self-Closing Study Loop Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All implementation subagents run on Opus (per user instruction).**

**Goal:** Make every generated study prompt end the session by having the tutor LLM (a) recap the student's weak spots and (b) hand them a ready-to-paste follow-up prompt — so the study loop perpetuates with zero return trip to Composed.

**Architecture:** Two surgical edits to Section 7 (SELF-CHECK) of the prompt, in both generation paths — the Opus system prompt and the deterministic `buildSelfCheckSection`. Shared-package only; no frontend, no backend.

**Tech Stack:** TypeScript, Vitest, npm workspaces.

**Spec:** `docs/superpowers/specs/2026-05-31-self-closing-study-loop-design.md`

---

## File map

- **Modify** `packages/shared/src/templates/shared.ts` (`buildSelfCheckSection` — deterministic loop-closer) + **Modify** `packages/shared/tests/unit/templates-shared.test.ts` (assert it)
- **Modify** `packages/shared/src/generation/opus-full-prompt.ts` (Section 7 of `OPUS_SYSTEM_PROMPT` — Opus loop-closer)

**Note on `packages/shared` type-checking:** this package cannot be type-checked by standalone `tsc` (a pre-existing `composite`/`declaration:false` conflict → `TS6304`). Verify with **Vitest only**; consumers type-check it downstream. Do NOT run `tsc --noEmit` in `packages/shared`.

---

## Task 1: Deterministic loop-closer (TDD)

**Files:** Modify `packages/shared/tests/unit/templates-shared.test.ts`, `packages/shared/src/templates/shared.ts`

- [ ] **Step 1: Write the failing test**

In `packages/shared/tests/unit/templates-shared.test.ts`, add this test immediately after the existing `'Self-Check section references the assessment'` test (the one ending at the `});` after `expect(out).toMatch(/before responding/i);`):
```typescript
  it('Self-Check closes the loop with a recap + ready-to-paste follow-up prompt', () => {
    const out = buildSelfCheckSection(baseInputs);
    expect(out).toMatch(/recap/i);
    expect(out).toMatch(/follow-up prompt/i);
    expect(out).toMatch(/weak spots/i);
  });
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd packages/shared && npx vitest run tests/unit/templates-shared.test.ts`
Expected: FAIL — the new test fails (current `buildSelfCheckSection` output has none of "recap" / "follow-up prompt" / "weak spots").

- [ ] **Step 3: Implement the loop-closer**

In `packages/shared/src/templates/shared.ts`, in `buildSelfCheckSection`, replace this final array line:
```typescript
    'After your response, ask: "Did this hit what you needed? If not, what should be different?"',
```
with these three lines:
```typescript
    'When we finish, close the session by doing two things:',
    '- Give me a short, honest recap of the specific things I got wrong or was shaky on.',
    '- Then write me a ready-to-paste follow-up prompt for my next session that skips the warm-up and drills exactly those weak spots with active recall.',
```

- [ ] **Step 4: Run, verify it passes**

Run: `cd packages/shared && npx vitest run tests/unit/templates-shared.test.ts`
Expected: PASS (all tests, including the new loop-closer test). The existing `'Self-Check section references the assessment'` test still passes (the "Before responding:" line is unchanged).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/templates/shared.ts packages/shared/tests/unit/templates-shared.test.ts
git commit -m "feat(shared): deterministic prompt self-closes the study loop (recap + follow-up prompt)"
```

---

## Task 2: Opus system-prompt loop-closer

**Files:** Modify `packages/shared/src/generation/opus-full-prompt.ts`

- [ ] **Step 1: Edit Section 7 of the system prompt**

In `packages/shared/src/generation/opus-full-prompt.ts`, inside the `OPUS_SYSTEM_PROMPT` template literal, replace the entire Section 7 line:
```
7. SELF-CHECK — Quality control instructions for the tutor LLM (verify alignment with course level; ask clarifying questions before going deep; explain reasoning when pushed back on; don't simply agree). End with an iteration ask: "did this hit what you needed?"
```
with:
```
7. SELF-CHECK — Quality control instructions for the tutor LLM (verify alignment with course level; ask clarifying questions before going deep; explain reasoning when pushed back on; don't simply agree). End by telling the tutor to CLOSE the session with two things: (a) a short, honest recap of the specific concepts the student got wrong or was shaky on this session, and (b) a ready-to-paste follow-up prompt the student can drop into a fresh chat next time — one that assumes this first pass is done and goes straight to hard active recall on exactly those weak spots.
```
(Only that one numbered line changes. Leave the rest of `OPUS_SYSTEM_PROMPT` — the Format, Pedagogy, Style, and Pomfret-context sections — untouched.)

This is a deliberate change to the cached system prompt; it invalidates the ephemeral prompt cache once (the next generation re-caches with the new text). One-time, negligible.

- [ ] **Step 2: Confirm the existing Opus tests still pass**

Run: `cd packages/shared && npx vitest run tests/unit/opus-full-prompt.test.ts`
Expected: PASS (these tests cover `buildUserMessage` / the generation flow with a mocked client; the system-prompt-string edit does not change their behavior).

- [ ] **Step 3: Commit**

```bash
git add packages/shared/src/generation/opus-full-prompt.ts
git commit -m "feat(shared): Opus prompt self-closes the study loop (recap + follow-up prompt)"
```

---

## Task 3: Full verification

**Files:** none

- [ ] **Step 1: Run the full shared suite**

Run: `cd packages/shared && npx vitest run`
Expected: all pass (incl. the new templates-shared loop-closer test and the unchanged opus-full-prompt tests).

- [ ] **Step 2: Confirm a clean tree**

Run: `git status --short`
Expected: empty.

- [ ] **Step 3: [MANUAL] Live check after a backend deploy**

All prompt generation — both the Opus path and the deterministic fallback — runs in the `apps/api` backend on Fly, which imports `packages/shared`. So the live prompts only carry the loop-closer after the **backend is redeployed (`fly deploy`)**; a Vercel/frontend deploy is NOT required for this feature (the frontend just displays whatever `/api/generate` returns). After `fly deploy`: generate a prompt on the live site and confirm the SELF-CHECK section (`<self_check>` for Claude / `## SELF_CHECK` for GPT / `Step 7 — SELF_CHECK` for Gemini) ends with the weak-spot recap + the ready-to-paste follow-up-prompt instruction.

---

## Notes for the implementer

- **Shared-only change.** No frontend, no backend code, no new files.
- **Do NOT run `tsc --noEmit` in `packages/shared`** (known `composite`/`declaration` conflict → `TS6304`). Use Vitest; consumers type-check shared downstream.
- The Opus system-prompt edit is intentional and busts the prompt cache once — do not worry about it.
- Two commits (one per task). Keep the rest of both files byte-for-byte unchanged.
