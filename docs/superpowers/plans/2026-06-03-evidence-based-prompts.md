# Evidence-Based Study Prompts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make every generated study prompt (and the Sharpen pass) operationalize the highest-utility learning techniques — retrieval practice, self-explanation, the LearnLM tutoring rubric — scaled to the student's confidence, plus steer students off rereading/highlighting.

**Architecture:** Pure prompt + microcopy engineering. Strengthen three system prompts (`OPUS_SYSTEM_PROMPT`, the Sharpen `CRITIC_SYSTEM`, `REVISE_SYSTEM_PROMPT`) and add one wizard tip. No new routes, schema, dependencies, or LLM-cost change.

**Tech Stack:** packages/shared (generation prompts), apps/api (Sharpen critic), apps/web (ModePicker), Vitest.

---

### Task 1: Strengthen the generation system prompt (+ guard test)

**Files:**
- Modify: `packages/shared/src/generation/opus-full-prompt.ts` (`OPUS_SYSTEM_PROMPT` — section 5 + the Pedagogy block; add `export`)
- Modify: `packages/shared/package.json` (exports map — add the deep path so the test resolves)
- Create: `packages/shared/tests/unit/opus-system-prompt.test.ts`

- [ ] **Step 1: Export the prompt.** In `opus-full-prompt.ts`, change `const OPUS_SYSTEM_PROMPT = ` → `export const OPUS_SYSTEM_PROMPT = `.

- [ ] **Step 2: Add the deep-path export.** In `packages/shared/package.json`, in the `exports` map (next to the existing `"./src/generation/revise-prompt.js"` entry), add:
```json
    "./src/generation/opus-full-prompt.js": "./src/generation/opus-full-prompt.ts",
```

- [ ] **Step 3: Write the failing guard test.** Create `packages/shared/tests/unit/opus-system-prompt.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { OPUS_SYSTEM_PROMPT } from '@composed-prompts/shared/src/generation/opus-full-prompt.js';

describe('OPUS_SYSTEM_PROMPT encodes the evidence-based directives', () => {
  const p = OPUS_SYSTEM_PROMPT;
  it('leads with retrieval practice', () => {
    expect(p).toMatch(/Retrieval practice/i);
    expect(p).toMatch(/before you explain/i);
  });
  it('mixes question formats', () => {
    expect(p).toMatch(/multiple-choice and short-answer/i);
  });
  it('forces self-explanation', () => {
    expect(p).toMatch(/self-explanation/i);
    expect(p).toMatch(/underlying principle/i);
  });
  it('uses the LearnLM tutoring stance', () => {
    expect(p).toMatch(/do not give away answers/i);
    expect(p).toMatch(/discover their own mistakes/i);
  });
  it('scales scaffolding to confidence', () => {
    expect(p).toMatch(/scaffolding to the student's confidence/i);
  });
});
```

- [ ] **Step 4: Run — verify FAIL.** `cd packages/shared && npx vitest run tests/unit/opus-system-prompt.test.ts` → FAIL (directives not present yet).

- [ ] **Step 5: Edit section 5 (INTERACTION STYLE).** In `OPUS_SYSTEM_PROMPT`, replace the section-5 line:
```
5. INTERACTION STYLE — How the tutor LLM should engage. Be specific to their mode + confidence + time. End with a single sentence naming 2-3 CONCRETE misconceptions a student at this level would likely have about THIS SPECIFIC MATERIAL — name the actual concept, not a meta-description.
```
with:
```
5. INTERACTION STYLE — How the tutor LLM should engage. Be specific to their mode + confidence + time. The tutor must LEAD WITH RETRIEVAL: open by asking the student to recall or attempt, and keep making the student do the thinking, before you explain. End with a single sentence naming 2-3 CONCRETE misconceptions a student at this level would likely have about THIS SPECIFIC MATERIAL — name the actual concept, not a meta-description.
```

- [ ] **Step 6: Replace the Pedagogy block.** Replace the entire `# Pedagogy (apply throughout)` block (the six bullets, lines ~44-51) with:
```
# Pedagogy (apply throughout)

- Retrieval practice first: make the student attempt or recall BEFORE you explain. Quiz, don't lecture — self-testing beats re-reading and highlighting.
- Mix question formats: use BOTH multiple-choice and short-answer / free-recall, not just one.
- Force self-explanation: have the student explain WHY something is true and HOW they'd reach an answer, and name the underlying principle, before you confirm.
- Tutoring stance: do not give away answers too quickly; ask questions that make the student think; guide them to discover their own mistakes.
- Brief corrections (1-2 sentences), then immediately re-test the same concept. Spaced practice across days when time allows.
- Scale the scaffolding to the student's confidence: more hints and smaller steps when they're shaky on hard material; harder active recall when they're confident — don't overwhelm a novice with heavy self-explanation.
- For essay/project: coach the process, never write the student's work for them.
```

- [ ] **Step 7: Run — verify PASS.** `cd packages/shared && npx vitest run tests/unit/opus-system-prompt.test.ts && npx vitest run` → new test 5/5 + full shared suite green. Then `cd ../../apps/api && npx tsc --noEmit` (confirms the exported const + exports map compile in a consumer).

- [ ] **Step 8: Commit.**
```bash
git add packages/shared/src/generation/opus-full-prompt.ts packages/shared/package.json packages/shared/tests/unit/opus-system-prompt.test.ts
git commit -m "feat(shared): evidence-based generation prompt (retrieval-first, self-explanation, LearnLM, confidence-scaled)"
```

---

### Task 2: Evidence-based Sharpen (critic + reviser)

**Files:**
- Modify: `apps/api/src/lib/openai.ts` (`CRITIC_SYSTEM`)
- Modify: `packages/shared/src/generation/revise-prompt.ts` (`REVISE_SYSTEM_PROMPT`)

- [ ] **Step 1: Upgrade the critic.** In `apps/api/src/lib/openai.ts`, replace the `CRITIC_SYSTEM` string with:
```ts
const CRITIC_SYSTEM = `You are a prompt-engineering critic grounded in learning science. You will be shown a study prompt that another AI wrote for a Pomfret School student, plus the student's situation. Judge it against this evidence-based checklist and name concrete, specific weaknesses plus exactly what would make it sharper:
- Retrieval practice: does it make the student attempt or recall BEFORE explaining, and mix multiple-choice AND short-answer formats?
- Self-explanation: does it force the student to explain WHY/HOW and name the underlying principle?
- Tutoring stance: does it avoid giving away answers too quickly, ask questions that make the student think, and guide them to find their own mistakes — rather than lecture?
- Fit: is the scaffolding scaled to the student's confidence (not overwhelming a novice on hard material)? Are the named misconceptions concrete?
Name actual gaps, not generic advice. Be terse and specific. Do NOT rewrite the prompt; only critique it.`;
```

- [ ] **Step 2: Align the reviser.** In `packages/shared/src/generation/revise-prompt.ts`, in `REVISE_SYSTEM_PROMPT`, add one bullet to the "Produce an IMPROVED version" list (after the "Fixes the valid, specific points" bullet):
```
- Make sure the improved prompt drives retrieval practice (mixed multiple-choice + short-answer), forces self-explanation (why/how + the underlying principle), uses a guide-don't-tell tutoring stance, and scales scaffolding to the student's confidence.
```

- [ ] **Step 3: Verify.** `cd apps/api && npx vitest run tests/unit/openai.test.ts tests/integration/sharpen-route.test.ts && npx tsc --noEmit` and `cd ../../packages/shared && npx vitest run tests/unit/revise-prompt.test.ts`. Expected: all green (these tests assert behavior/structure, not the system-prompt wording, so they still pass).

- [ ] **Step 4: Commit.**
```bash
git add apps/api/src/lib/openai.ts packages/shared/src/generation/revise-prompt.ts
git commit -m "feat(sharpen): critic + reviser judge against the evidence-based rubric"
```

---

### Task 3: Wizard microcopy — nudge toward self-testing

**Files:**
- Modify: `apps/web/components/ModePicker.tsx`

- [ ] **Step 1: Add the tip.** Read `ModePicker.tsx`. Below the list of mode options (after the `.map(...)` that renders the modes, still inside the component's returned container), add a single muted tip line:
```tsx
<p className="mt-3 text-xs text-muted-foreground">Tip: testing yourself beats re-reading or highlighting — every mode here builds in active recall.</p>
```
Match the file's existing class conventions (Editorial Calm tokens: `text-muted-foreground`). Change nothing else — no flow change, no new step.

- [ ] **Step 2: Verify.** `cd apps/web && npx tsc --noEmit`.

- [ ] **Step 3: Commit.**
```bash
git add apps/web/components/ModePicker.tsx
git commit -m "feat(web): wizard tip steering students from rereading to self-testing"
```

---

### Task 4: Whole-feature verification

- [ ] **Step 1: All suites + build.**
```bash
cd /Users/likerun/Desktop/prompt/packages/shared && npx vitest run
cd /Users/likerun/Desktop/prompt/apps/api && npx vitest run && npx tsc --noEmit
cd /Users/likerun/Desktop/prompt/apps/web && npm run build && npx vitest run
```
Expected: all green; web build succeeds.
- [ ] **Step 2: Zombie check.** `git status --short`; `rm -rf` `apps/web/app/about/` / `apps/web/components/RagPanel.tsx` if they reappear.
- [ ] **Step 3: `/browse` a real generation.** Signed-out: `composed-prompts.vercel.app` → Start studying → fill the wizard → generate. Read the produced prompt and confirm it now (a) leads with retrieval/quizzing before explaining, (b) forces self-explanation (why/how + principle), (c) reads like a guide-don't-tell tutor, and (d) the wizard's mode step shows the self-testing tip. (This requires the changes to be deployed — so do this AFTER the push/Vercel deploy, or run the wizard locally.)
- [ ] **Step 4: Whole-diff review.** Dispatch a reviewer over `git diff <task1^>..HEAD` confirming: the three prompts encode the directives, no behavior/route/schema changes, no prompt bloat that buries the framework, the guard test is meaningful.

---

## Self-Review

**Spec coverage:** ✅ generation prompt — retrieval-first + mixed formats + self-explanation + LearnLM stance + confidence-scaling (Task 1, guard-tested); Sharpen critic + reviser rubric (Task 2); wizard self-testing nudge (Task 3); verification + /browse eyeball (Task 4). No new infra/cost. Expertise-reversal handled via the confidence-scaling bullet.

**Placeholder scan:** none — exact replacement strings for all three prompts + the test + the tip line.

**Type consistency:** `OPUS_SYSTEM_PROMPT` is exported (Task 1) and imported by the test via the package deep path added to `exports` in the same task; the guard-test regexes match the exact strings written into the Pedagogy block + section 5. `CRITIC_SYSTEM` / `REVISE_SYSTEM_PROMPT` are module-internal strings — edited in place, no signature change, so existing tests stay green.
