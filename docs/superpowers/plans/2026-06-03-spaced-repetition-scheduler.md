# Spaced-Repetition Study Scheduler Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the study schedule's even round-robin day-selection with horizon-scaled, expanding-gap review days so studying is distributed (gaps widen as the assessment horizon lengthens), always with a review the day before the test.

**Architecture:** One contained change to the day-selection inside `proposeStudyBlocks` (`packages/shared/src/study-schedule.ts`). The `StudyBlock` type, the ≤60-min session split, the 7pm back-to-back placement (incl. the bump-past-`now` logic), `buildIcs`, and all three surfaces stay unchanged — they all flow through this one function, so they upgrade together. Plus one copy line in `StudySchedule.tsx`.

**Tech Stack:** packages/shared (TypeScript, Vitest), apps/web (Next.js 14 / React, the schedule component).

---

## File Structure

- `packages/shared/src/study-schedule.ts` — **modify** `proposeStudyBlocks`: a new private `reviewDayOffsets(windowDays, sessionCount)` helper picks the expanding-gap review-day offsets; the function maps those offsets to dates and reuses the existing round-robin + 7pm placement verbatim.
- `packages/shared/tests/unit/study-schedule.test.ts` — **modify**: update one existing test (remainder lands on the last review day), rewrite the "spreads one per day" test as the expanding-gap headline, add invariant tests; keep the cram/past/7pm/stacking tests as-is.
- `packages/shared/tests/unit/ics.test.ts` — **NO CHANGE** (its tests pass hardcoded `BLOCKS` into the unchanged `buildIcs`; do not touch).
- `apps/web/components/StudySchedule.tsx` — **modify**: label each session row "Review N of M".

---

### Task 1: Expanding-gap day-selection in `proposeStudyBlocks` (TDD)

**Files:**
- Modify: `packages/shared/tests/unit/study-schedule.test.ts`
- Modify: `packages/shared/src/study-schedule.ts`

- [ ] **Step 1: Replace the test file with the new expectations.** Overwrite `packages/shared/tests/unit/study-schedule.test.ts` with:

```ts
import { describe, it, expect } from 'vitest';
import { proposeStudyBlocks, type StudyBlock } from '@composed-prompts/shared';

// new Date(year, monthIndex, day, h, m, s) is LOCAL time; the function reads/writes
// local components, so these assertions are timezone-independent.
const at = (y: number, mo: number, d: number, h = 8, mi = 0) => new Date(y, mo - 1, d, h, mi, 0);

const dates = (blocks: StudyBlock[]): string[] => blocks.map((b) => b.start.slice(0, 10));
const minutes = (b: StudyBlock): number => {
  const ms = (iso: string): number => {
    const [d, t] = iso.split('T');
    const [y, mo, da] = d!.split('-').map(Number);
    const [h, mi, s] = t!.split(':').map(Number);
    return new Date(y!, mo! - 1, da!, h!, mi!, s!).getTime();
  };
  return Math.round((ms(b.end) - ms(b.start)) / 60000);
};
// Distinct whole-day offsets from start-of-`now`, in block order.
const dayOffsets = (blocks: StudyBlock[], now: Date): number[] => {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const out: number[] = [];
  for (const b of blocks) {
    const [y, mo, d] = b.start.slice(0, 10).split('-').map(Number);
    const off = Math.round((new Date(y!, mo! - 1, d!).getTime() - start) / 86400000);
    if (!out.includes(off)) out.push(off);
  }
  return out;
};

describe('proposeStudyBlocks', () => {
  it('returns [] for zero or negative hours', () => {
    expect(proposeStudyBlocks({ assessmentDate: '2026-06-10', hoursAvailable: 0, now: at(2026, 6, 1) })).toEqual([]);
  });

  it('splits into <=60-min sessions with a shorter remainder', () => {
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-10', hoursAvailable: 2.5, now: at(2026, 6, 1) });
    expect(blocks.length).toBe(3);
    expect(blocks[0]).toEqual({ start: '2026-06-01T19:00:00', end: '2026-06-01T20:00:00' });
    // remainder session is 30 min, on the LAST review day (expanding-gap spacing).
    expect(blocks[2]).toEqual({ start: '2026-06-09T19:00:00', end: '2026-06-09T19:30:00' });
  });

  it('places review days at expanding gaps, last one the day before the test', () => {
    // Test in 14 days with 5 one-hour sessions → one session per review day on
    // days 0, 2, 5, 9, 13 (gaps 2,3,4,4 — widening), last = the day before the test.
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-15', hoursAvailable: 5, now: at(2026, 6, 1) });
    expect(dates(blocks)).toEqual(['2026-06-01', '2026-06-03', '2026-06-06', '2026-06-10', '2026-06-14']);
    blocks.forEach((b) => expect(b.start.slice(11)).toBe('19:00:00'));
    blocks.forEach((b) => expect(minutes(b)).toBe(60));
  });

  it('widens gaps monotonically and ends the day before the test', () => {
    const now = at(2026, 6, 1);
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-15', hoursAvailable: 5, now });
    const offs = dayOffsets(blocks, now);
    for (let i = 1; i < offs.length; i++) expect(offs[i]!).toBeGreaterThan(offs[i - 1]!); // strictly increasing
    const gaps = offs.slice(1).map((o, i) => o - offs[i]!);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]!).toBeGreaterThanOrEqual(gaps[i - 1]!); // expanding
    expect(offs[offs.length - 1]).toBe(13); // Jun 15 test → last review offset 13 (Jun 14)
  });

  it('caps review days at 6 even for a long horizon with many hours', () => {
    // 10 hours (10 sessions) toward a test ~100 days out → at most 6 distinct review days.
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-09-09', hoursAvailable: 10, now: at(2026, 6, 1) });
    const distinct = new Set(dates(blocks));
    expect(distinct.size).toBeLessThanOrEqual(6);
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('preserves total study minutes and keeps every block <=60 min', () => {
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-15', hoursAvailable: 5, now: at(2026, 6, 1) });
    expect(blocks.reduce((s, b) => s + minutes(b), 0)).toBe(300);
    blocks.forEach((b) => expect(minutes(b)).toBeLessThanOrEqual(60));
  });

  it('crams everything today when the assessment is today, stacking back-to-back', () => {
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-01', hoursAvailable: 2, now: at(2026, 6, 1) });
    expect(blocks).toEqual([
      { start: '2026-06-01T19:00:00', end: '2026-06-01T20:00:00' },
      { start: '2026-06-01T20:00:00', end: '2026-06-01T21:00:00' },
    ]);
  });

  it("starts today's blocks at the next hour when 7 PM has already passed", () => {
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-01', hoursAvailable: 1, now: at(2026, 6, 1, 21, 30) });
    expect(blocks).toEqual([{ start: '2026-06-01T22:00:00', end: '2026-06-01T23:00:00' }]);
  });

  it('crams today (no crash) when the assessment date is in the past', () => {
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-01', hoursAvailable: 1, now: at(2026, 6, 5) });
    expect(blocks).toEqual([{ start: '2026-06-05T19:00:00', end: '2026-06-05T20:00:00' }]);
  });

  it('stacks multiple sessions per day when sessions exceed available review days', () => {
    // 3 sessions, test in 2 days → review days Jun 1 & Jun 2; Jun 1 gets two back-to-back.
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-03', hoursAvailable: 3, now: at(2026, 6, 1) });
    expect(blocks).toEqual([
      { start: '2026-06-01T19:00:00', end: '2026-06-01T20:00:00' },
      { start: '2026-06-01T20:00:00', end: '2026-06-01T21:00:00' },
      { start: '2026-06-02T19:00:00', end: '2026-06-02T20:00:00' },
    ]);
  });
});
```

- [ ] **Step 2: Run the tests — verify the new ones FAIL.**

Run: `cd packages/shared && npx vitest run tests/unit/study-schedule.test.ts`
Expected: FAIL. The `splits into <=60-min sessions` test fails (current code puts the remainder on `2026-06-03`, not `2026-06-09`); `places review days at expanding gaps`, `widens gaps monotonically`, and `caps review days at 6` all fail (current round-robin spreads one-per-day across consecutive days). The cram/past/7pm/stacking tests already pass.

- [ ] **Step 3: Rewrite the day-selection in `proposeStudyBlocks`.** Overwrite `packages/shared/src/study-schedule.ts` with:

```ts
export type StudyBlock = { start: string; end: string };
// Local datetime strings, e.g. '2026-06-12T19:00:00' — no 'Z', no timezone offset.

const pad = (n: number): string => String(n).padStart(2, '0');

// Format a Date's LOCAL components as 'YYYY-MM-DDTHH:mm:ss'.
function toLocalIso(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_REVIEW_DAYS = 6;
const GAP_EXPONENT = 1.4; // >1 ⇒ review days cluster early and spread out toward the test.

// Pick review-day OFFSETS (whole days from today) with gaps that WIDEN toward the test.
// `windowDays` = whole days from today to the assessment day (offset 0 = today,
// offset windowDays-1 = the day before the test). `sessionCount` caps the number of
// review days — no point scheduling more review days than there are sessions.
// Distributed practice: fewer, well-spaced reviews beat the same hours crammed into
// consecutive days (which is what the old even round-robin produced).
function reviewDayOffsets(windowDays: number, sessionCount: number): number[] {
  if (windowDays <= 1) return [0]; // test today/tomorrow/past → cram today
  const r = Math.max(
    1,
    Math.min(1 + Math.round(Math.log2(windowDays)), sessionCount, windowDays, MAX_REVIEW_DAYS),
  );
  if (r <= 1) return [0];
  const last = windowDays - 1;
  const raw: number[] = [];
  for (let i = 0; i < r; i++) {
    raw.push(Math.round(last * Math.pow(i / (r - 1), GAP_EXPONENT)));
  }
  // `raw` is non-decreasing (convex curve); dedupe keeps it strictly increasing on
  // small windows where rounding can collide (fewer review days is fine).
  return [...new Set(raw)];
}

export function proposeStudyBlocks(input: {
  assessmentDate: string; // 'yyyy-mm-dd'
  hoursAvailable: number;
  now?: Date;
}): StudyBlock[] {
  const now = input.now ?? new Date();
  const totalMinutes = Math.round(input.hoursAvailable * 60);
  if (totalMinutes <= 0) return [];

  // 1. Split into <=60-min sessions (final one shorter for the remainder).
  const sessions: number[] = [];
  let remaining = totalMinutes;
  while (remaining > 0) {
    const d = Math.min(60, remaining);
    sessions.push(d);
    remaining -= d;
  }

  // 2. Choose review days at EXPANDING gaps across [today .. day-before-assessment].
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [ay, am, ad] = input.assessmentDate.split('-').map(Number);
  const assessmentDay = new Date(ay ?? 1970, (am ?? 1) - 1, ad ?? 1); // local midnight
  const windowDays = Math.round((assessmentDay.getTime() - startOfToday.getTime()) / MS_PER_DAY);
  const days: Date[] = reviewDayOffsets(windowDays, sessions.length).map((off) => {
    const d = new Date(startOfToday);
    d.setDate(d.getDate() + off);
    return d;
  });

  // 3. Round-robin sessions across the chosen review days.
  const perDay: number[][] = days.map(() => []);
  sessions.forEach((dur, i) => {
    perDay[i % days.length]!.push(dur);
  });

  // 4. Place each day's sessions starting at 19:00 (or the next top-of-hour after
  // `now` if today and 7 PM has passed), stacking back-to-back.
  const blocks: StudyBlock[] = [];
  days.forEach((day, di) => {
    const durations = perDay[di]!;
    if (durations.length === 0) return;

    const firstStart = new Date(day);
    firstStart.setHours(19, 0, 0, 0);
    // If 7 PM has already passed today, bump to the next top-of-hour after `now`.
    // Late at night this can roll today's sessions past midnight onto the next
    // calendar date — acceptable, since the schedule is editable downstream.
    if (sameDay(day, now) && now.getTime() >= firstStart.getTime()) {
      const next = new Date(now);
      next.setMinutes(0, 0, 0);
      next.setHours(next.getHours() + 1);
      firstStart.setTime(next.getTime());
    }

    let cursorTime = new Date(firstStart);
    for (const dur of durations) {
      const start = new Date(cursorTime);
      const end = new Date(start.getTime() + dur * 60 * 1000);
      blocks.push({ start: toLocalIso(start), end: toLocalIso(end) });
      cursorTime = end;
    }
  });

  return blocks;
}
```

- [ ] **Step 4: Run the tests — verify all PASS.**

Run: `cd packages/shared && npx vitest run tests/unit/study-schedule.test.ts`
Expected: PASS (all 10 tests).

- [ ] **Step 5: Run the full shared suite + the ics test (proves `buildIcs` is untouched).**

Run: `cd packages/shared && npx vitest run`
Expected: PASS — every suite green, including `ics.test.ts` (unchanged).

- [ ] **Step 6: Typecheck a consumer.**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean (the `StudyBlock`/`proposeStudyBlocks` signatures are unchanged, so consumers still compile).

- [ ] **Step 7: Commit.**

```bash
cd /Users/likerun/Desktop/prompt
git add packages/shared/src/study-schedule.ts packages/shared/tests/unit/study-schedule.test.ts
git commit -m "feat(shared): expanding-gap spaced-repetition study scheduler"
```

---

### Task 2: Label each session "Review N of M" in `StudySchedule`

**Files:**
- Modify: `apps/web/components/StudySchedule.tsx`

- [ ] **Step 1: Add the label to each session row.** In `apps/web/components/StudySchedule.tsx`, find the session `<li>` (the one with `className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-2 text-sm"`). Immediately after its opening `>` and before the first `<Input type="date" ...>`, insert:

```tsx
              <span className="w-full text-xs font-medium text-muted-foreground">
                Review {i + 1} of {blocks.length}
              </span>
```

The `w-full` makes the label take its own line above the inputs (the row is `flex-wrap`), so the date/time/length controls stay on the next line. `i` and `blocks` are already in scope (`blocks.map((b, i) => ...)`).

- [ ] **Step 2: Typecheck.**

Run: `cd apps/web && npx tsc --noEmit`
Expected: clean.

- [ ] **Step 3: Commit.**

```bash
cd /Users/likerun/Desktop/prompt
git add apps/web/components/StudySchedule.tsx
git commit -m "feat(web): label study sessions 'Review N of M'"
```

---

### Task 3: Whole-feature verification

- [ ] **Step 1: All shared tests + typecheck.**

```bash
cd /Users/likerun/Desktop/prompt/packages/shared && npx vitest run && npx tsc --noEmit
```
Expected: all green; tsc clean.

- [ ] **Step 2: API typecheck (shared is a dependency) + web build.**

```bash
cd /Users/likerun/Desktop/prompt/apps/api && npx tsc --noEmit
cd /Users/likerun/Desktop/prompt/apps/web && npx tsc --noEmit && npm run build
```
Expected: tsc clean; web build succeeds. (If the web build fails only on a missing `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` static-export step, that is the known environmental gotcha, not a regression — note it and continue.)

- [ ] **Step 3: Zombie-file check.**

Run: `cd /Users/likerun/Desktop/prompt && git status --short`
Expected: only the intended files. If `apps/web/app/about/` or `apps/web/components/RagPanel.tsx` reappear, `rm -rf` them.

- [ ] **Step 4: `/browse` the live schedule (after deploy or locally).** Once deployed (or via `cd apps/web && npm run dev`), generate a prompt for a test ~2 weeks out with a few hours available, land on the result page, scroll to "Plan your study sessions", and confirm: (a) the review days are NOT consecutive — they sit at widening gaps with the last one the day before the test; (b) each row is labeled "Review N of M"; (c) "Add to calendar (.ics)" still downloads a file that imports those same spaced dates. (This is client-side, so it goes live as soon as Vercel redeploys.)

- [ ] **Step 5: Whole-diff review.** Dispatch a code reviewer over `git diff <task1^>..HEAD` (the two feature commits) confirming: the day-selection is the only logic change; the ≤60-min split, the 7pm/bump placement, `buildIcs`, and the `StudyBlock` type are untouched; the expanding-gap formula matches the spec (`R = clamp(1+round(log2 W), 1, min(S,W,6))`, offsets `round((W-1)*(i/(R-1))^1.4)`, cram at `W≤1`); the tests assert the spec's invariants (expanding gaps, last = day-before-test, caps, total minutes preserved); no surface other than the `StudySchedule` label changed.

---

## Self-Review

**Spec coverage:**
- ✅ Horizon-scaled expanding-gap day-selection (`reviewDayOffsets`, exponent 1.4, R formula) — Task 1, Step 3.
- ✅ Keep session split / 7pm placement / `buildIcs` / `StudyBlock` / surfaces unchanged — Task 1 reuses steps 1 & 4 verbatim; `ics.test.ts` untouched (called out); Task 3 Step 5 verifies.
- ✅ Unit tests: expanding gaps non-decreasing, last = day-before-test, cram W≤1, R caps (≤6/≤S/≤W), strictly-increasing starts, ≤60 min, total minutes preserved — Task 1, Step 1.
- ✅ Existing study-schedule tests updated (remainder → last review day; "one per day" → expanding headline); cram/past/7pm/stacking retained — Task 1, Step 1.
- ✅ "Review N of M" copy — Task 2.
- ✅ Verify shared tests + tsc + web build + /browse — Task 3.

**Placeholder scan:** none — complete test file, complete implementation, exact JSX insert, exact commands.

**Type consistency:** `proposeStudyBlocks({ assessmentDate, hoursAvailable, now? })` and `StudyBlock = { start; end }` are unchanged, so `StudySchedule.tsx`, `buildIcs`, `/plan`, and the result page still compile. The new helper `reviewDayOffsets(windowDays: number, sessionCount: number): number[]` is module-private (not exported), used only inside `proposeStudyBlocks`. Constants `MS_PER_DAY`, `MAX_REVIEW_DAYS`, `GAP_EXPONENT` are module-local.

**Scope check:** single function + its tests + one copy line. Focused; no new routes/schema/deps/cost. No decomposition needed.
