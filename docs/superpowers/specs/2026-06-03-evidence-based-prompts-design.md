# Evidence-Based Study Prompts — Design Spec

**Date:** 2026-06-03
**Status:** Approved (brainstorming)
**Topic:** Upgrade Composed's generated study prompts (and the Sharpen pass) to operationalize the highest-utility learning-science techniques, plus steer students off low-utility study habits.

---

## Goal

Make every prompt Composed generates *teach the tutor to study the student correctly* — leading with retrieval practice, forcing self-explanation, and following a research-backed pedagogy rubric — without changing any flow, route, schema, dependency, or LLM cost. Pure prompt + microcopy engineering.

## Why (research basis, fact-checked)

From the deep-research report (`docs/superpowers/specs/` companion; full cited report in the workflow output):
- **Retrieval practice** (self-quizzing) and **distributed practice** are the only two HIGH-utility techniques across the field (practice testing *d*≈0.74, +0.51 vs rereading; distributed practice *d*≈0.85). Composed can embed retrieval *instructions* into the prompt today.
- **Self-explanation** prompting yields *g*=0.55 across 64 reports, and the meta-analysis authors **explicitly recommend computer-generated self-explanation prompts** — Composed's exact mechanism.
- **Mix question formats:** multiple-choice items showed +0.70, short-answer +0.48 — so the tutor should use both, not one.
- **LearnLM pedagogy rubric:** pedagogically-tuned models were preferred **+31% over GPT-4o** by 248 experts; the rubric ("does not give away answers too quickly," "asks questions to encourage the student to think," "guides the student to discover their own mistakes," organized around manage-cognitive-load / active-learning / metacognition / curiosity / adapt-to-learner) is a ready-made spec.
- **Low-utility habits to steer away from:** rereading, highlighting/underlining, summarization, keyword mnemonics, imagery-for-text — the two most *popular* (rereading, highlighting) are ineffective; recommend self-testing in their place.
- **Caveat — expertise reversal:** heavy self-explanation/elaboration can overload **novices on complex material**. Scaffolding must **scale with the student's prior knowledge/confidence** (Composed already collects confidence in the wizard), not be one-size-fits-all.

## What changes (3 surfaces)

### 1. Generation system prompt — `packages/shared/src/generation/opus-full-prompt.ts` (`OPUS_SYSTEM_PROMPT`)
The 7-section Pomfret-Study framework stays; strengthen the instructions so the generated prompt tells the student's tutor LLM to:
- **Retrieval-first:** open the session by *quizzing* the student on the material before explaining; mix **multiple-choice and short-answer/free-recall** items; only explain after an attempt.
- **Self-explanation / elaborative interrogation:** require the student to explain *why* something is true and *how* they'd reach an answer, and to name the underlying principle, before the tutor confirms.
- **Pedagogy rubric (LearnLM):** the tutor "does not give away answers too quickly, asks questions that make the student think, and guides the student to discover their own mistakes"; manages cognitive load; adapts to the student.
- **Scale to confidence:** lighter scaffolding/hints for a shaky student on hard material, heavier active-recall/self-explanation for a confident student (use the confidence the wizard already collects).

These land primarily in the framework's **Interaction Style**, **Output Spec**, and **Self-Check** sections and the **Pedagogy** block (which already mentions active recall + spaced practice — this makes it explicit and enforced). Keep additions tight; do not bloat the prompt.

### 2. Sharpen — `apps/api/src/lib/openai.ts` (`CRITIC_SYSTEM`) + `packages/shared/src/generation/revise-prompt.ts` (`REVISE_SYSTEM_PROMPT`)
- The **GPT critic** gets the LearnLM rubric + retrieval/self-explanation criteria as an **explicit checklist**: does this prompt drive retrieval practice (mixed formats)? force self-explanation? avoid giving away answers? promote active learning + metacognition? It critiques against that bar.
- The **Opus reviser** revises with the same rubric in mind, keeping the original format/framework.

### 3. Wizard microcopy — study-mode picker (`apps/web/components/ModePicker.tsx` and/or the `STUDY_MODE_DESCRIPTIONS` in `packages/shared/src/templates`)
A light, one-line nudge toward self-testing over rereading/highlighting (e.g., a small "Tip: testing yourself beats re-reading" line, or a phrase in the mode descriptions). **No flow change, no new step.**

## Out of scope

- In-app quizzes (#3) and the notes-grounded tutor (#4) — staged later.
- No new routes, schema, dependencies, or LLM-cost change (same calls, better instructions).
- No reminders/notifications (research: reminders bred dependence with no learning gain).

## Verification

- Existing `generate` + `sharpen` + shared tests stay green; `tsc` clean; web build passes.
- A cheap assertion test that `OPUS_SYSTEM_PROMPT` (and the critic/revise system prompts) contain the key new directives (e.g., includes "retrieval"/"self-explanation"/"do not give away") — guards against accidental regression of the pedagogy, without trying to test prompt "quality."
- `/browse` a real signed-out generation (wizard → result) and eyeball that the produced prompt now leads with retrieval + self-explanation and reads like a LearnLM-style tutor, not an exposition dump.

## Risks / notes

- **Prompt bloat / clarity:** additions must be terse; a longer system prompt can dilute. Favor sharpening existing sections over appending new ones.
- **Expertise reversal:** the confidence-scaling instruction is load-bearing — without it, heavy self-explanation could hurt novices on hard material.
- **Effect-size caveats (from the research):** the headline effect sizes skew toward surface/factual recall; gains on deep conceptual/AP material are likely smaller. This upgrade is still net-positive and free, but it's not a silver bullet — the bigger wins (in-app retrieval, spacing) are the staged follow-ons.
