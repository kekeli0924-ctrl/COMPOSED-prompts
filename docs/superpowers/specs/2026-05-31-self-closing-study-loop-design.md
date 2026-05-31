# Self-Closing Study Loop — Design Spec

**Date:** 2026-05-31
**Status:** Approved (brainstorming) → ready for implementation plan
**Product:** Composed (Pomfret study-prompt generator)

## Context

Composed generates a high-quality study prompt; the student copies it into their LLM and studies. Today the loop ends there — no follow-up. The obvious "close the loop" idea (have students come back and report what was fuzzy) was rejected during brainstorming: students won't do that.

Solution: close the loop **inside the prompt**. Enhance the prompt's SELF-CHECK section so the student's own tutor-LLM ends every session by (a) naming what the student missed, and (b) handing them a ready-to-paste follow-up prompt that drills those gaps next time. Zero return trip to Composed, zero reporting — the loop perpetuates inside the LLM conversation.

## Goal

Every generated study prompt instructs the tutor LLM to end the session with a weak-spot recap **plus** a ready-to-paste, gap-targeted follow-up prompt — so a single Composed visit yields a self-perpetuating study loop.

## Non-goals

- No new UI, no return-to-Composed flow, no student reporting, no "Round 2" button (rejected: students won't return).
- No backend, route, or storage changes.
- Composed does not ingest the student's LLM session or output.
- No per-mode specialization of the loop-closer (the shared Self-Check already covers all five study modes).

## Decisions (settled in brainstorming)

- Close the loop via prompt enhancement (the tutor LLM self-closes), not via a Composed return visit.
- Enhance Section 7 (SELF-CHECK) in **both** generation paths — Opus and the deterministic fallback — so the behavior holds whichever path produced the prompt.

## Design

### 1. Opus system prompt (`packages/shared/src/generation/opus-full-prompt.ts`)

Section 7 (SELF-CHECK) of `OPUS_SYSTEM_PROMPT` currently ends with: `End with an iteration ask: "did this hit what you needed?"`. Replace that closing clause with a loop-closer directive instructing the generated prompt to tell the tutor to **end the session** with:
- (a) a short, honest recap of the specific concepts the student missed or was shaky on, and
- (b) a ready-to-paste follow-up prompt for a fresh chat next time that assumes the first pass is done and goes straight to hard active recall on exactly those weak spots.

The rest of Section 7 (verify alignment with course level; ask clarifying questions; explain reasoning when pushed back on; don't simply agree) stays.

**Caveat:** changing `OPUS_SYSTEM_PROMPT` invalidates the ephemeral prompt cache once (the next generation re-caches with the new text). One-time, negligible cost.

### 2. Deterministic fallback (`packages/shared/src/templates/shared.ts`)

`buildSelfCheckSection` currently ends with `After your response, ask: "Did this hit what you needed? If not, what should be different?"`. Add the same loop-closer (recap + ready-to-paste follow-up prompt) to its output. Because every study mode composes this shared `buildSelfCheckSection`, the loop applies to all modes (cram-review, multi-day-plan, practice-questions, concept-clarification, essay-project).

### 3. Wording (both paths convey the same intent)

End-of-session instruction to the tutor, phrased in the student's first person for the deterministic path and as a directive for the Opus framework: *"When we finish, do two things: (1) give me a short, honest recap of the specific things I got wrong or was shaky on; (2) write me a ready-to-paste follow-up prompt for my next session that skips the warm-up and drills exactly those weak spots with active recall."*

## Testing

- `packages/shared` (Vitest): extend `packages/shared/tests/unit/templates-shared.test.ts` to assert `buildSelfCheckSection` output contains the loop-closer — both the weak-spot recap instruction and the "follow-up prompt" instruction.
- Manual/live: generate a prompt on the deployed site and confirm the SELF-CHECK section ends with the recap + ready-to-paste follow-up-prompt instruction (the Opus path, which isn't unit-tested for content).

## Files touched (summary)

- `packages/shared/src/generation/opus-full-prompt.ts` (Section 7 of `OPUS_SYSTEM_PROMPT`)
- `packages/shared/src/templates/shared.ts` (`buildSelfCheckSection`)
- `packages/shared/tests/unit/templates-shared.test.ts` (assert the loop-closer)

## Future

A one-tap "Round 2" button in Composed (regenerate a harder second-pass prompt) remains a possible later add for the students who *do* return — deferred, since the self-closing prompt already closes the loop with zero return trip.
