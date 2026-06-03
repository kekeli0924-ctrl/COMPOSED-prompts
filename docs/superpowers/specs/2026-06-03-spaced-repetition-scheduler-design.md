# Spaced-Repetition Study Scheduler (v1) — Design Spec

**Date:** 2026-06-03
**Status:** Approved (brainstorming)
**Topic:** Replace the study schedule's even round-robin spacing with horizon-scaled, expanding-gap review days, so studying is distributed (not crammed, not front-loaded) toward the assessment date.

---

## Goal

Upgrade `proposeStudyBlocks` so review sessions land on **fewer, well-spaced days with gaps that widen as the assessment horizon lengthens**, always including a review the day before the test. Contained to one function + its tests; every surface that uses it upgrades automatically.

## Why (research basis)

From the deep-research report: **distributed practice is the single most effective study technique** (*d*≈0.85), and the **optimal gap between sessions grows with the retention horizon** (Cepeda: ~3/8/12/27 days for 7/35/70/350-day horizons). The current even round-robin doesn't deliver this — worse, when there are fewer sessions than days, `i % days.length` piles all sessions onto the **first** days and leaves a dead gap before the test. This fixes both.

## Decided specifics (from brainstorming)

1. **Horizon-scaled expanding gaps** (not a fixed ladder).
2. **Wizard assessment date** as the source (Canvas auto-scheduling = a separate follow-on).
3. **Session-level** blocks (no per-topic; per-item FSRS needs in-app quizzing #3 first).

## The change (one function)

`packages/shared/src/study-schedule.ts` → `proposeStudyBlocks({ assessmentDate, hoursAvailable, now? }): StudyBlock[]`. **The `StudyBlock` type, the ≤60-min session split, the 7pm back-to-back placement (incl. the "bump past `now`" logic), `buildIcs`, and all three surfaces stay unchanged.** Only the *day-selection* changes.

### Algorithm — expanding ladder fitted to the horizon
1. **Sessions:** split `hoursAvailable` into ≤60-min sessions (unchanged). Let **S** = session count. If `hoursAvailable ≤ 0` → `[]`.
2. **Window:** `W` = whole days from start-of-today to the assessment day (local midnights). The review window is offsets `[0 … W-1]` where offset 0 = today and offset `W-1` = the day before the test. If **W ≤ 1** (test today/tomorrow/past) → one review day = **today** (cram).
3. **Review-day count R** = `clamp(1 + round(log2(W)), 1, min(S, W, 6))`. Grows with the horizon, never exceeds the sessions you have, the days available, or a cap of **6**. (Examples: W=2→2, W=3→3, W=7→4, W=14→5, W=21→5, W≥32→6.)
4. **Expanding-gap offsets:** for `i = 0 … R-1`, `offset_i = round((W-1) * (i/(R-1))^1.4)` (when R>1; R=1 → `[0]`). The exponent **1.4** makes points denser early and sparser later, so consecutive gaps **expand**, with `offset_0 = 0` (today) and `offset_{R-1} = W-1` (day before test). Dedupe to a strictly-increasing offset list (rounding can collide on small windows; fewer review days is fine).
5. **Distribute + place:** round-robin the S sessions across the R chosen review days, then place each day's sessions at 7pm back-to-back (the existing placement code, reused verbatim).

**Worked examples** (W = days-to-test):
- W=14, 5h → offsets `0, 2, 5, 9, 13` (gaps 2→3→4→4, expanding; last = day-before-test).
- W=3, 3h → `0, 1, 2`.
- W=1 → today only.

## Surfaces

All three call `proposeStudyBlocks`, so they upgrade together: the result-page opt-in schedule, `app/(app)/plan/page.tsx`, and `apps/web/components/StudySchedule.tsx`. **Copy touch:** `StudySchedule` labels each block "Review N of M" (count from the block order). No layout change.

## Out of scope (v1)

- Canvas-driven scheduling (build a spaced schedule from a real Canvas assessment) — follow-on.
- Per-topic sessions; per-item FSRS (needs #3).
- No new endpoints, schema, dependencies, or surfaces.

## Testing

Unit-test `proposeStudyBlocks` (the spacing is now the core logic):
- **Expanding gaps:** for a long horizon (e.g. W=14, enough hours), successive review-day gaps are non-decreasing and the last block is on the day before the test.
- **Cram:** W ≤ 1 → all sessions today.
- **Caps:** R never exceeds 6, never exceeds session count, never exceeds W.
- **Invariants:** block start times strictly increasing; every block ≤ 60 min; total session minutes ≈ `hoursAvailable*60` (unchanged from today).
- Update the existing `study-schedule` + `ics` tests to the new expected blocks (the even-spread expectations change).

## Verification

- `packages/shared` tests green (new + updated); `tsc` clean; web `npm run build`.
- `/browse` the `/plan` page (or result-page schedule) and confirm the sessions land on spaced, expanding-gap days with a review the day before the test — and the `.ics` download reflects it.

## Risks / notes

- **Behavior change:** this concentrates studying onto fewer, well-spaced days instead of a little every day — intended (spacing beats daily grind), but visible. Accepted in brainstorming.
- **Tuning the curve:** the exponent (1.6) and the R formula are heuristics anchored on the research direction, not exact-optimal; they're easy to tune later and are covered by the invariant tests, not brittle exact-offset assertions where avoidable.
- **Short windows:** rounding collisions on small W naturally reduce the review-day count (handled by the dedupe) — fine.
