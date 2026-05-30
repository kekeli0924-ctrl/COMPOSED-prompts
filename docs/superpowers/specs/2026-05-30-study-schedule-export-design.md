# Study Schedule + Calendar Export (.ics) — Design Spec

**Date:** 2026-05-30
**Status:** Approved (brainstorming) → ready for implementation plan
**Product:** Composed (Pomfret study-prompt generator)

## Context: a pivot from the Google Calendar subsystem

The original "Google Calendar + study reminders" feature decomposed into three specs:

1. **Foundation** — connect Google Calendar + read free/busy (built + shipped; see `2026-05-29-calendar-foundation-design.md`).
2. **Availability preferences editor.**
3. **Schedule + deliver** study blocks by writing Google Calendar events.

During live testing, signing in with a `@pomfret.org` account hit Google Workspace's third-party app access control: `Error 400: access_not_configured` / "your institution's admin needs to review composed prompt pomfret." Pomfret IT restricts OAuth apps to an admin allowlist, which **overrides** the OAuth consent-screen test-user list. This blocks both the calendar *read* (Spec 1's scope) and the planned calendar *write* (Spec 3's delivery) for the actual user base — every Pomfret student.

Rather than depend on Pomfret IT allowlisting a personal-project OAuth client, this spec pivots to a path that needs no OAuth and no admin approval, and **collapses the old Specs 2 + 3 into one feature**:

- The student's availability is entered **manually, per assessment** (no calendar read).
- Study blocks are **delivered as a downloadable `.ics` file** the student imports into their own calendar (school or personal). Importing an `.ics` is a user action in their calendar client — it does **not** go through the Workspace third-party-app gate — so it works for `@pomfret.org` accounts. The calendar app's native reminders become the notification channel.

The shipped Calendar Foundation (Spec 1) stays in the codebase as an optional enhancement (it works for personal Google accounts, or if Pomfret IT ever trusts the app), but is no longer on the critical path.

## Goal

From an assessment's `hoursAvailable` + `assessmentDate`, propose an editable study schedule and let the student export it as an `.ics` file they import into any calendar — turning "here's your study prompt" into "here's exactly when to study, on your calendar, with reminders." No backend, no storage, no OAuth.

## Non-goals

- No Google Calendar API read or write; no OAuth (that's the gated path being replaced).
- No persistent / recurring weekly availability profile — scheduling is per-assessment.
- No server-side scheduling, storage, or delivery — compute + `.ics` generation are pure and client-side; the `.ics` in the student's calendar is the durable artifact.
- No email / SMS / push channel.
- No drag-on-grid calendar editor — a simple editable list.
- The schedule is not folded into the generated LLM prompt; it is a separate artifact shown alongside it.

## Decisions (settled in brainstorming)

- **Delivery:** downloadable `.ics` import (native calendar reminders; no OAuth; works on `@pomfret.org` accounts).
- **Availability:** per-assessment, editable (no saved profile).
- **Placement:** both — the wizard result page (reuses already-entered inputs) and a standalone `/plan` page (small date + hours form).
- **Edit surface:** simple editable list (date · start · length, with add/remove).
- **Persistence:** ephemeral (nothing saved server- or client-side).

## Design

### 1. Pure shared core (`packages/shared`)

**`packages/shared/src/study-schedule.ts`** (new):

```ts
export type StudyBlock = { start: string; end: string };
// Local datetime strings, e.g. '2026-06-12T19:00:00' — no 'Z', no timezone offset.

export function proposeStudyBlocks(input: {
  assessmentDate: string;   // 'yyyy-mm-dd'
  hoursAvailable: number;   // e.g. 0.5, 1, 2, 6, 24
  now?: Date;               // defaults to new Date()
}): StudyBlock[];
```

Deterministic heuristic:

1. `totalMinutes = round(hoursAvailable * 60)`; if `<= 0` → `[]`. Split into sessions of **60 min** (final session shorter if there is a remainder): `2.5h` → `[60, 60, 30]`.
2. **Available days** = each calendar day from `startOfDay(now)` through the day **before** `assessmentDate`. If that set is empty (assessment is today or in the past) → `[startOfDay(now)]` (cram mode).
3. **Spread** sessions round-robin across the available days (session `i` → day `i % days.length`), so coverage is even across early and late days.
4. **Time of day**: each day's first session starts at **19:00**, except **today**, whose first session starts at the later of 19:00 or the next top-of-hour after `now` (so a late-night cram never proposes a past time). Additional same-day sessions stack back-to-back (19:00–20:00, 20:00–21:00…). Emit `StudyBlock { start, end }` as local datetime strings.

**`packages/shared/src/ics.ts`** (new):

```ts
import type { StudyBlock } from './study-schedule.js';
export function buildIcs(
  blocks: StudyBlock[],
  opts: { courseLabel: string; assessmentType: string },
): string;
```

- `VCALENDAR` (`VERSION:2.0`, `PRODID:-//Composed//Study Schedule//EN`, `CALSCALE:GREGORIAN`), one `VEVENT` per block.
- **Floating local time**: `DTSTART:20260612T190000` / `DTEND` with no `Z` and no `TZID`, so events display at the chosen wall-clock time in any timezone.
- Per event: unique `UID`, `DTSTAMP` (UTC now), `SUMMARY` = `Study: {courseLabel} ({assessmentType})`, a short `DESCRIPTION`, and a `VALARM` (`ACTION:DISPLAY`, `TRIGGER:-PT10M`).
- RFC 5545: escape `\`, `;`, `,`, and newlines in text values; CRLF (`\r\n`) line endings.

Both functions are pure, no I/O, fully unit-tested. Export both from `packages/shared/src/index.ts`.

**Reminder nuance:** Apple Calendar honors the `VALARM`; Google Calendar's *import* often substitutes the user's default event notifications — either way the events land on the calendar and notify on the user's default timing. We include `VALARM` for clients that respect it.

### 2. Frontend (`apps/web`)

**`apps/web/components/StudySchedule.tsx`** (new) — the shared engine UI. Props: `{ assessmentDate: string; hoursAvailable: number; courseLabel: string; assessmentType: string }`.

- On mount, computes the default schedule via `proposeStudyBlocks` into local React state.
- Renders an **editable list**: one row per block with date, start-time, and length controls; an "Add session" button (defaults to a sensible next slot) and per-row remove.
- **"Reset to suggested"** recomputes the default.
- **"Add to calendar (.ics)"** builds the file via `buildIcs` and triggers a client-side download (Blob + `URL.createObjectURL` + a temporary anchor; filename e.g. `composed-study-{assessmentType}.ics`). Disabled when the list is empty.
- A short hint: "Imports into Google, Apple, or Outlook Calendar. You'll get your calendar's normal reminders."

**`apps/web/app/wizard/page.tsx`** (modify) — when writing `sessionStorage['pomfret.lastResult']` (~line 116), additionally include `assessmentDate`, `hoursAvailable`, a derived `courseLabel` (course name from `courseId`, else `courseFreeText`, else "your course"), and `assessmentType`.

**`apps/web/app/wizard/result/page.tsx`** (modify) — extend the `LastResult` type with those four fields; after the prompt output (and before the feedback card), render `<StudySchedule … />` inside its own card titled "Plan your study sessions." If the four fields are absent (older cached `lastResult`), skip the card gracefully.

**`apps/web/app/plan/page.tsx`** (new) — standalone: a small form (assessment-date picker + an hours input mirroring the wizard's options + a free-text "what are you studying for?" that becomes `courseLabel`) → on submit, render `<StudySchedule … />` with those values (`assessmentType` defaults to `study session`).

### 3. Data flow

- **Result page:** wizard inputs (already collected) → stashed in `lastResult` → result page → `<StudySchedule>` → `proposeStudyBlocks` → editable React state → `buildIcs` → Blob download.
- **Standalone:** form inputs → `<StudySchedule>` → same path.
- No network, no persistence at any step.

### 4. Edge cases

- `hoursAvailable` 0 / empty → no blocks; export disabled.
- Assessment today or past → all sessions today (cram); a past date shows a gentle "that date has passed — scheduling for today" note.
- Very large `hoursAvailable` → many blocks; the student trims; "Reset to suggested" restores defaults.
- Empty list after edits → export disabled.
- Floating local times sidestep timezone / DST.
- `.ics` correctness: unique `UID`s, CRLF, RFC-5545 escaping in `SUMMARY` / `DESCRIPTION`.

## Testing

- **`packages/shared` (Vitest):**
  - `proposeStudyBlocks` — 60-min split + remainder (`2.5h → [60,60,30]`); spreads across today → day-before-assessment; assessment-today / past → all today; default 19:00 + back-to-back stacking; today's first start respects the next-top-of-hour rule when 19:00 has passed; `0` / negative hours → `[]`; large hours stays bounded/sane.
  - `buildIcs` — valid `VCALENDAR`; one `VEVENT` per block; floating `DTSTART`/`DTEND` (no `Z`); `VALARM` present; `SUMMARY` escaping (commas / semicolons); unique `UID`s; CRLF endings.
- **`apps/web`:** build + type-check; the list editing + `.ics` download verified manually (a Blob download is not meaningfully unit-testable).

## Files touched (summary)

- `packages/shared/src/study-schedule.ts` (new — `StudyBlock` + `proposeStudyBlocks`) + `packages/shared/src/ics.ts` (new — `buildIcs`) + `packages/shared/src/index.ts` (exports) + tests in `packages/shared/tests/unit/`
- `apps/web/components/StudySchedule.tsx` (new)
- `apps/web/app/wizard/page.tsx` (stash scheduling inputs into `lastResult`)
- `apps/web/app/wizard/result/page.tsx` (extend `LastResult`, render `<StudySchedule>`)
- `apps/web/app/plan/page.tsx` (new — standalone)

## Implementation note

Per user instruction, **all implementation subagents for this feature run on Opus** (not Sonnet).

## Future

If Pomfret IT ever allowlists the OAuth client (or for students on personal Google accounts), the shipped Calendar Foundation can layer back in as an optional "read my real free/busy to avoid conflicts" enhancement. A persistent weekly availability profile remains a possible later addition if per-assessment entry proves repetitive in practice.
