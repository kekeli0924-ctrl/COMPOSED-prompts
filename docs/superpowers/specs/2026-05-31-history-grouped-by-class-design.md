# History Grouped by Class — Design Spec

**Date:** 2026-05-31
**Status:** Approved (brainstorming)
**Topic:** Organize the History page's prompts into per-class blocks instead of one flat list.

---

## Goal

On the History page, group a student's past prompts by **class** so they're organized per course, instead of a single chronological list. Pure frontend reorganization — each entry already carries its `courseId`.

## Decided specifics (from brainstorming)

1. **Sectioned headers** — each class is a labeled section (class name + prompt count) with that class's prompts listed beneath it. Always expanded (no accordion, no filter chips).
2. **Most-recent-activity first** — the class whose newest prompt is most recent sits at the top.
3. **Free-text / no-class prompts** → a single **"Other"** block, always at the bottom.

## The grouping helper

A pure, unit-tested function in `apps/web/lib/group-history.ts`:

```ts
import type { HistoryEntry } from '@composed-prompts/shared';
import { findCourse } from '@composed-prompts/shared';

export type HistoryGroup = { key: string; label: string; count: number; entries: HistoryEntry[] };

export function groupHistoryByClass(entries: HistoryEntry[]): HistoryGroup[];
```

Behavior:
- Group entries by `courseId`. For a non-null `courseId`, `label = findCourse(courseId)?.name ?? courseId`, `key = courseId`. All **null-`courseId`** entries go in one group with `key = 'other'`, `label = 'Other'`.
- Within each group, entries keep the input order (the source list is already newest-first), so no re-sort needed; `count = entries.length`.
- **Sort the groups** by each group's newest `createdAt` (descending). The **`'other'` group always sorts last**, regardless of its recency.
- Empty input → `[]`.

## Rendering

In `apps/web/app/(app)/history/page.tsx`: replace the flat `entries.map(...)` with `groupHistoryByClass(entries).map(group => ...)`. Each group renders:
- A **section header** — `{group.label} · {group.count} prompt{s}` in the Editorial Calm style (e.g. a serif/label heading + muted count).
- The existing per-entry cards beneath it (reuse the current entry-card component/markup verbatim — same expand-prompt + rating behavior).

Loading and empty states are unchanged. Applies to **both** the signed-in (`/api/me/history`) and signed-out (local `listHistory()`) entry lists — both carry `courseId`.

## Out of scope

- No backend, no API, no schema, no new deps.
- No collapsing/filtering (sectioned, always-expanded).
- No change to the entry card itself (expand, rating, prompt display) — only the grouping wrapper around it.

## Verification

- Unit-test `groupHistoryByClass` (`apps/web/tests/unit/group-history.test.ts`): groups by course; "Other" collects null-courseId and sorts last; groups ordered by most-recent activity; per-group count; empty input → `[]`.
- `apps/web` `npm run build` + existing `vitest` (incl. the new test) green; `npx tsc --noEmit` clean.
- `/browse` (signed-in) the History page: classes appear as sections, newest-activity class first, "Other" last, counts correct.

## Risks / notes

- Free-text classes have `courseId = null` (the typed name lives in `inputsJson`, not in `HistoryEntry`), so they correctly all fall into "Other" — matches the decision, no extra field needed.
- Keep the entry-card markup byte-identical when extracting it into the group loop (no behavior change).
