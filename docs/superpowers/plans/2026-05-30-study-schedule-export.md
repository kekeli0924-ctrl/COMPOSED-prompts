# Study Schedule + Calendar Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All implementation subagents run on Opus (per user instruction).**

**Goal:** From an assessment's `hoursAvailable` + `assessmentDate`, propose an editable study schedule and let the student export it as a `.ics` file they import into their own calendar (native reminders, no OAuth).

**Architecture:** Two pure, unit-tested functions in `packages/shared` (`proposeStudyBlocks`, `buildIcs`) plus a client-only `<StudySchedule>` editable-list component, wired into the wizard result page (reusing inputs the wizard now stashes) and a standalone `/plan` page. No backend, no DB, no OAuth.

**Tech Stack:** TypeScript, React 19 / Next.js 14 (App Router), Vitest, npm workspaces.

**Spec:** `docs/superpowers/specs/2026-05-30-study-schedule-export-design.md`

---

## File map

- **Create** `packages/shared/src/study-schedule.ts` (`StudyBlock` + `proposeStudyBlocks`) + `tests/unit/study-schedule.test.ts`; **Modify** `packages/shared/src/index.ts`
- **Create** `packages/shared/src/ics.ts` (`buildIcs`) + `tests/unit/ics.test.ts`; **Modify** `packages/shared/src/index.ts`
- **Create** `apps/web/components/StudySchedule.tsx`
- **Modify** `apps/web/app/wizard/page.tsx` (stash scheduling inputs), `apps/web/app/wizard/result/page.tsx` (render)
- **Create** `apps/web/app/plan/page.tsx`

**Note on `packages/shared` type-checking:** this package cannot be type-checked by standalone `tsc` (a pre-existing `composite` + `declaration:false` config conflict — `tsc --noEmit` errors `TS6304`). Verify shared code with **Vitest only**; its types are checked downstream by `apps/web`'s `npm run build` (Task 6). Do **not** run `tsc --noEmit` in `packages/shared`.

---

## Task 1: Shared `proposeStudyBlocks` (TDD)

**Files:** Create `packages/shared/src/study-schedule.ts`, `packages/shared/tests/unit/study-schedule.test.ts`; Modify `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/tests/unit/study-schedule.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { proposeStudyBlocks } from '@composed-prompts/shared';

// new Date(year, monthIndex, day, h, m, s) is LOCAL time; the function reads/writes
// local components, so these assertions are timezone-independent.
const at = (y: number, mo: number, d: number, h = 8, mi = 0) => new Date(y, mo - 1, d, h, mi, 0);

describe('proposeStudyBlocks', () => {
  it('returns [] for zero or negative hours', () => {
    expect(proposeStudyBlocks({ assessmentDate: '2026-06-10', hoursAvailable: 0, now: at(2026, 6, 1) })).toEqual([]);
  });

  it('splits into <=60-min sessions with a shorter remainder', () => {
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-10', hoursAvailable: 2.5, now: at(2026, 6, 1) });
    expect(blocks.length).toBe(3);
    expect(blocks[0]).toEqual({ start: '2026-06-01T19:00:00', end: '2026-06-01T20:00:00' });
    // remainder session is 30 min on the third day
    expect(blocks[2]).toEqual({ start: '2026-06-03T19:00:00', end: '2026-06-03T19:30:00' });
  });

  it('spreads one session per day across the days before the assessment', () => {
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-05', hoursAvailable: 4, now: at(2026, 6, 1) });
    expect(blocks.map((b) => b.start.slice(0, 10))).toEqual([
      '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04',
    ]);
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
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd packages/shared && npx vitest run tests/unit/study-schedule.test.ts`
Expected: FAIL — `proposeStudyBlocks` not exported / module not found.

- [ ] **Step 3: Implement**

Create `packages/shared/src/study-schedule.ts`:
```typescript
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

  // 2. Available days: startOfDay(now) .. day BEFORE assessmentDate.
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [ay, am, ad] = input.assessmentDate.split('-').map(Number);
  const assessmentDay = new Date(ay ?? 1970, (am ?? 1) - 1, ad ?? 1); // local midnight

  const days: Date[] = [];
  const cursor = new Date(startOfToday);
  while (cursor < assessmentDay) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  if (days.length === 0) days.push(new Date(startOfToday)); // cram today

  // 3. Round-robin sessions across the days.
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

- [ ] **Step 4: Export from the barrel**

In `packages/shared/src/index.ts`, add immediately after the existing `export * from './calendar.js';` line:
```typescript
export * from './study-schedule.js';
```

- [ ] **Step 5: Run, verify it passes**

Run: `cd packages/shared && npx vitest run tests/unit/study-schedule.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/study-schedule.ts packages/shared/src/index.ts packages/shared/tests/unit/study-schedule.test.ts
git commit -m "feat(shared): proposeStudyBlocks + StudyBlock"
```

---

## Task 2: Shared `buildIcs` (TDD)

**Files:** Create `packages/shared/src/ics.ts`, `packages/shared/tests/unit/ics.test.ts`; Modify `packages/shared/src/index.ts`

- [ ] **Step 1: Write the failing test**

Create `packages/shared/tests/unit/ics.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildIcs, type StudyBlock } from '@composed-prompts/shared';

const BLOCKS: StudyBlock[] = [
  { start: '2026-06-12T19:00:00', end: '2026-06-12T20:00:00' },
  { start: '2026-06-13T19:00:00', end: '2026-06-13T19:30:00' },
];

describe('buildIcs', () => {
  it('wraps events in a VCALENDAR with one VEVENT per block', () => {
    const ics = buildIcs(BLOCKS, { courseLabel: 'Biology', assessmentType: 'test' });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(2);
  });

  it('emits floating local DTSTART/DTEND (no Z)', () => {
    const ics = buildIcs(BLOCKS, { courseLabel: 'Biology', assessmentType: 'test' });
    expect(ics).toContain('DTSTART:20260612T190000');
    expect(ics).toContain('DTEND:20260612T200000');
    expect(ics).not.toMatch(/DTSTART:[0-9T]+Z/);
  });

  it('includes a 10-minute VALARM per event', () => {
    const ics = buildIcs(BLOCKS, { courseLabel: 'Biology', assessmentType: 'test' });
    expect(ics.match(/BEGIN:VALARM/g)?.length).toBe(2);
    expect(ics).toContain('TRIGGER:-PT10M');
  });

  it('escapes commas in the summary and gives each event a unique UID', () => {
    const ics = buildIcs(BLOCKS, { courseLabel: 'Math, Science', assessmentType: 'test' });
    expect(ics).toContain('Math\\, Science');
    const uids = [...ics.matchAll(/UID:(.+)/g)].map((m) => m[1]);
    expect(new Set(uids).size).toBe(2);
  });

  it('uses CRLF line endings', () => {
    const ics = buildIcs(BLOCKS, { courseLabel: 'Biology', assessmentType: 'test' });
    expect(ics).toContain('\r\n');
  });
});
```

- [ ] **Step 2: Run, verify it fails**

Run: `cd packages/shared && npx vitest run tests/unit/ics.test.ts`
Expected: FAIL — `buildIcs` not exported.

- [ ] **Step 3: Implement**

Create `packages/shared/src/ics.ts`:
```typescript
import type { StudyBlock } from './study-schedule.js';

// RFC 5545 text escaping: backslash, semicolon, comma, newline.
function escapeText(s: string): string {
  return s
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

// '2026-06-12T19:00:00' (local floating) -> '20260612T190000' (no Z, no TZID).
function toIcsLocal(dt: string): string {
  return dt.replace(/[-:]/g, '').replace(/\.\d+$/, '');
}

function icsStampUtc(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0');
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

// Note: line folding (RFC 5545 §3.1, >75 octets) is intentionally omitted — study
// SUMMARY lines stay well under 75 chars for realistic course labels, and Google /
// Apple / Outlook all import unfolded lines fine.
export function buildIcs(
  blocks: StudyBlock[],
  opts: { courseLabel: string; assessmentType: string },
): string {
  const dtstamp = icsStampUtc(new Date());
  const summary = escapeText(`Study: ${opts.courseLabel} (${opts.assessmentType})`);
  const description = escapeText('Composed study session.');

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Composed//Study Schedule//EN',
    'CALSCALE:GREGORIAN',
  ];

  blocks.forEach((b, i) => {
    lines.push(
      'BEGIN:VEVENT',
      `UID:composed-${i}-${toIcsLocal(b.start)}@composed.app`,
      `DTSTAMP:${dtstamp}`,
      `DTSTART:${toIcsLocal(b.start)}`,
      `DTEND:${toIcsLocal(b.end)}`,
      `SUMMARY:${summary}`,
      `DESCRIPTION:${description}`,
      'BEGIN:VALARM',
      'ACTION:DISPLAY',
      'DESCRIPTION:Study time',
      'TRIGGER:-PT10M',
      'END:VALARM',
      'END:VEVENT',
    );
  });

  lines.push('END:VCALENDAR');
  return lines.join('\r\n') + '\r\n';
}
```

- [ ] **Step 4: Export from the barrel**

In `packages/shared/src/index.ts`, add immediately after the `export * from './study-schedule.js';` line (added in Task 1):
```typescript
export * from './ics.js';
```

- [ ] **Step 5: Run, verify it passes**

Run: `cd packages/shared && npx vitest run tests/unit/ics.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/ics.ts packages/shared/src/index.ts packages/shared/tests/unit/ics.test.ts
git commit -m "feat(shared): buildIcs calendar export"
```

---

## Task 3: `StudySchedule` component

**Files:** Create `apps/web/components/StudySchedule.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/components/StudySchedule.tsx`:
```tsx
'use client';

import { useCallback, useState } from 'react';
import { proposeStudyBlocks, buildIcs, type StudyBlock } from '@composed-prompts/shared';

type Props = {
  assessmentDate: string; // 'yyyy-mm-dd'
  hoursAvailable: number;
  courseLabel: string;
  assessmentType: string;
};

const LENGTHS = [
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '1 hour', minutes: 60 },
  { label: '1.5 hours', minutes: 90 },
  { label: '2 hours', minutes: 120 },
];

const datePart = (iso: string): string => iso.slice(0, 10); // yyyy-mm-dd
const timePart = (iso: string): string => iso.slice(11, 16); // hh:mm

const localMs = (iso: string): number => {
  const [d, t] = iso.split('T');
  const [y, mo, da] = d!.split('-').map(Number);
  const [h, mi] = t!.split(':').map(Number);
  return new Date(y!, mo! - 1, da!, h!, mi!).getTime();
};

const pad = (n: number): string => String(n).padStart(2, '0');
const fmt = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
};
const makeIso = (date: string, time: string): string => `${date}T${time}:00`;
const addMin = (iso: string, min: number): string => fmt(localMs(iso) + min * 60000);
const durationMin = (b: StudyBlock): number => Math.round((localMs(b.end) - localMs(b.start)) / 60000);

export function StudySchedule({ assessmentDate, hoursAvailable, courseLabel, assessmentType }: Props) {
  const [blocks, setBlocks] = useState<StudyBlock[]>(() => proposeStudyBlocks({ assessmentDate, hoursAvailable }));

  const reset = useCallback(() => {
    setBlocks(proposeStudyBlocks({ assessmentDate, hoursAvailable }));
  }, [assessmentDate, hoursAvailable]);

  const updateBlock = (i: number, date: string, time: string, min: number): void => {
    setBlocks((prev) =>
      prev.map((b, j) => (j === i ? { start: makeIso(date, time), end: addMin(makeIso(date, time), min) } : b)),
    );
  };

  const removeBlock = (i: number): void => setBlocks((prev) => prev.filter((_, j) => j !== i));

  const addBlock = (): void => {
    setBlocks((prev) => {
      const last = prev[prev.length - 1];
      const baseDate = last ? datePart(addMin(last.start, 24 * 60)) : assessmentDate;
      const startIso = `${baseDate}T19:00:00`;
      return [...prev, { start: startIso, end: addMin(startIso, 60) }];
    });
  };

  const download = (): void => {
    const ics = buildIcs(blocks, { courseLabel, assessmentType });
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `composed-study-${assessmentType.replace(/\s+/g, '-')}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const isPast = (() => {
    const [y, m, d] = assessmentDate.split('-').map(Number);
    const a = new Date(y!, m! - 1, d!);
    const now = new Date();
    return a < new Date(now.getFullYear(), now.getMonth(), now.getDate());
  })();

  return (
    <div className="rounded-lg border bg-white p-6">
      <h2 className="font-semibold">Plan your study sessions</h2>
      <p className="mt-1 text-sm text-slate-600">
        A suggested schedule for your {hoursAvailable} hour{hoursAvailable === 1 ? '' : 's'} before {assessmentDate}.
        Edit anything, then add it to your calendar.
      </p>
      {isPast && (
        <p className="mt-2 text-xs text-amber-700">That date has passed — these are scheduled for today.</p>
      )}

      {blocks.length === 0 ? (
        <p className="mt-4 text-sm text-slate-500">No sessions. Add one below.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {blocks.map((b, i) => (
            <li key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <input
                type="date"
                value={datePart(b.start)}
                onChange={(e) => updateBlock(i, e.target.value, timePart(b.start), durationMin(b))}
                className="rounded border px-2 py-1"
              />
              <input
                type="time"
                value={timePart(b.start)}
                onChange={(e) => updateBlock(i, datePart(b.start), e.target.value, durationMin(b))}
                className="rounded border px-2 py-1"
              />
              <select
                value={durationMin(b)}
                onChange={(e) => updateBlock(i, datePart(b.start), timePart(b.start), Number(e.target.value))}
                className="rounded border px-2 py-1"
                aria-label="Session length"
              >
                {LENGTHS.map((l) => (
                  <option key={l.minutes} value={l.minutes}>{l.label}</option>
                ))}
                {!LENGTHS.some((l) => l.minutes === durationMin(b)) && (
                  <option value={durationMin(b)}>{durationMin(b)} min</option>
                )}
              </select>
              <button
                type="button"
                onClick={() => removeBlock(i)}
                className="text-slate-400 hover:text-red-600"
                aria-label="Remove session"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={addBlock} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
          Add session
        </button>
        <button type="button" onClick={reset} className="rounded border px-3 py-1.5 text-sm hover:bg-slate-50">
          Reset to suggested
        </button>
        <button
          type="button"
          onClick={download}
          disabled={blocks.length === 0}
          className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Add to calendar (.ics)
        </button>
      </div>
      <p className="mt-2 text-xs text-slate-500">
        Imports into Google, Apple, or Outlook Calendar. You&apos;ll get your calendar&apos;s normal reminders.
      </p>
    </div>
  );
}
```

- [ ] **Step 2: Build**

Run: `cd apps/web && npm run build`
Expected: compiles with no type errors. (This also type-checks the shared `proposeStudyBlocks` / `buildIcs` imports.)

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/StudySchedule.tsx
git commit -m "feat(web): StudySchedule editable-list component (.ics export)"
```

---

## Task 4: Wizard stash + result-page render

**Files:** Modify `apps/web/app/wizard/page.tsx`, `apps/web/app/wizard/result/page.tsx`

- [ ] **Step 1: Stash the scheduling inputs in the wizard**

In `apps/web/app/wizard/page.tsx`:

Add a value import after the existing type import on line 15 (`import type { WizardInputs, GenerateResponse } from '@composed-prompts/shared';`):
```tsx
import { findCourse } from '@composed-prompts/shared';
```

Then change the `sessionStorage.setItem('pomfret.lastResult', …)` block (currently):
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
to:
```tsx
      sessionStorage.setItem(
        'pomfret.lastResult',
        JSON.stringify({
          ...data,
          entryId: entry.id,
          attachedMaterialKinds: payload.attachedMaterialKinds ?? [],
          schedule: {
            assessmentDate: payload.assessmentDate,
            hoursAvailable: payload.hoursAvailable,
            courseLabel:
              (payload.courseId ? findCourse(payload.courseId)?.name : payload.courseFreeText) ?? 'your course',
            assessmentType: payload.assessmentType,
          },
        }),
      );
```

- [ ] **Step 2: Render the schedule on the result page**

In `apps/web/app/wizard/result/page.tsx`:

Add the component import after the existing shared import on line 11:
```tsx
import { StudySchedule } from '@/components/StudySchedule';
```

Extend the `LastResult` type — add a `schedule` field after `attachedMaterialKinds`:
```tsx
type LastResult = {
  prompt: string;
  metadata: {
    promptHash: string;
    generator: 'opus' | 'deterministic';
    fallbackReason?: 'budget-exhausted' | 'api-error' | 'feature-disabled';
    generationId: string;
  };
  entryId: string;
  attachedMaterialKinds?: MaterialKind[];
  schedule?: {
    assessmentDate: string;
    hoursAvailable: number;
    courseLabel: string;
    assessmentType: string;
  };
};
```

Render `<StudySchedule>` immediately after the `<PromptOutput>` block (the `<div className="mt-6"><PromptOutput …/></div>`) and before the `<RagPanel>` block:
```tsx
      {data.schedule && (
        <div className="mt-8">
          <StudySchedule
            assessmentDate={data.schedule.assessmentDate}
            hoursAvailable={data.schedule.hoursAvailable}
            courseLabel={data.schedule.courseLabel}
            assessmentType={data.schedule.assessmentType}
          />
        </div>
      )}
```

- [ ] **Step 3: Build**

Run: `cd apps/web && npm run build`
Expected: compiles with no type errors.

- [ ] **Step 4: Commit**

```bash
git add apps/web/app/wizard/page.tsx apps/web/app/wizard/result/page.tsx
git commit -m "feat(web): schedule on the result page (stash wizard inputs + render)"
```

---

## Task 5: Standalone `/plan` page

**Files:** Create `apps/web/app/plan/page.tsx`

- [ ] **Step 1: Create the page**

Create `apps/web/app/plan/page.tsx`:
```tsx
'use client';

import { useState, type FormEvent } from 'react';
import { StudySchedule } from '@/components/StudySchedule';

const HOUR_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0.5, label: '30 minutes' },
  { value: 1, label: '1 hour' },
  { value: 2, label: '2 hours' },
  { value: 4, label: '4 hours' },
  { value: 8, label: '8 hours (a full day)' },
  { value: 24, label: '1 day' },
  { value: 48, label: '2 days' },
  { value: 72, label: '3 days' },
  { value: 168, label: '1 week' },
  { value: 336, label: '2 weeks' },
];

const today = (): string => new Date().toISOString().slice(0, 10);

export default function PlanPage() {
  const [subject, setSubject] = useState('');
  const [assessmentDate, setAssessmentDate] = useState(today());
  const [hours, setHours] = useState<number | ''>('');
  const [submitted, setSubmitted] = useState<{
    assessmentDate: string;
    hoursAvailable: number;
    courseLabel: string;
  } | null>(null);

  const build = (e: FormEvent): void => {
    e.preventDefault();
    if (hours === '') return;
    setSubmitted({ assessmentDate, hoursAvailable: hours, courseLabel: subject.trim() || 'Study' });
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Plan a study schedule</h1>
      <p className="mt-2 text-slate-600">
        Tell me what you&apos;re studying for and how much time you have — I&apos;ll suggest sessions you can add to
        your calendar.
      </p>

      <form onSubmit={build} className="mt-6 grid gap-4">
        <div>
          <label htmlFor="subject" className="text-sm text-slate-600">What are you studying for?</label>
          <input
            id="subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Biology test"
            className="mt-1 block w-full rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="date" className="text-sm text-slate-600">When is it?</label>
          <input
            id="date"
            type="date"
            value={assessmentDate}
            onChange={(e) => setAssessmentDate(e.target.value)}
            className="mt-1 block rounded border px-3 py-2"
          />
        </div>
        <div>
          <label htmlFor="hours" className="text-sm text-slate-600">How much study time do you have?</label>
          <select
            id="hours"
            value={hours === '' ? '' : String(hours)}
            onChange={(e) => setHours(e.target.value === '' ? '' : parseFloat(e.target.value))}
            className="mt-1 block rounded border px-3 py-2"
          >
            <option value="">Pick a range</option>
            {HOUR_OPTIONS.map((h) => (
              <option key={h.value} value={String(h.value)}>{h.label}</option>
            ))}
          </select>
        </div>
        <button
          type="submit"
          disabled={hours === ''}
          className="justify-self-start rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50"
        >
          Suggest schedule
        </button>
      </form>

      {submitted && (
        <div className="mt-8">
          <StudySchedule
            assessmentDate={submitted.assessmentDate}
            hoursAvailable={submitted.hoursAvailable}
            courseLabel={submitted.courseLabel}
            assessmentType="study session"
          />
        </div>
      )}
    </main>
  );
}
```

- [ ] **Step 2: Build**

Run: `cd apps/web && npm run build`
Expected: compiles; `/plan` appears in the route list.

- [ ] **Step 3: Commit**

```bash
git add apps/web/app/plan/page.tsx
git commit -m "feat(web): standalone /plan study-schedule page"
```

---

## Task 6: Full verification

**Files:** none

- [ ] **Step 1: Shared + web automated checks**

```bash
cd packages/shared && npx vitest run          # all pass (incl. study-schedule, ics)
cd apps/web && npm run build && npx vitest run # build compiles; existing web tests pass
```

- [ ] **Step 2: Confirm a clean tree**

Run: `git status --short`
Expected: empty (no stray/untracked files).

- [ ] **Step 3: [MANUAL] Smoke the flows**

After `git push` (Vercel auto-deploys the frontend — no backend change to deploy):
- Run the wizard for an assessment a few days out → on the result page, confirm the "Plan your study sessions" card shows suggested evening blocks; edit a row, add/remove a session, click **Add to calendar (.ics)** and confirm a `.ics` downloads and imports into a calendar with the events at the right local times.
- Visit `/plan` directly → fill the form → confirm the same card + export.

---

## Notes for the implementer

- **No backend, no DB, no `api-contracts`, no OAuth.** Everything is pure shared logic + client-side React.
- **Do NOT run `tsc --noEmit` in `packages/shared`** (known `composite`/`declaration` config conflict → `TS6304`). Use Vitest for shared; `apps/web`'s `npm run build` type-checks the shared usage.
- **Watch for stray untracked files** in `apps/web` (legacy zombies have reappeared before). Do NOT create shim/stub files; if `npm run build` fails on a missing module you didn't write, report it — don't paper over it.
- The `<StudySchedule>` component is client-only (`'use client'`) and uses browser APIs (`Blob`, `URL.createObjectURL`, `document`) — it is verified by build + manual smoke, not unit tests (per spec).
- Local floating datetime strings (`'2026-06-12T19:00:00'`, no `Z`) are intentional throughout, so blocks land at the right wall-clock time in any calendar.
