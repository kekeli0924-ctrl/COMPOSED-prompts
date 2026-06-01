# History Grouped by Class Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Group the History page's prompts into per-class sections (most-recent class first, free-text → "Other" last) instead of one flat list.

**Architecture:** A pure, unit-tested helper `groupHistoryByClass` groups the page's entries by `courseId`; the History page renders one section per group (header + the existing entry cards). Frontend only — both signed-in and local entries already carry `courseId`.

**Tech Stack:** Next.js 14 App Router, Tailwind + shadcn/ui (Editorial Calm tokens), Vitest.

---

## Important type note

The History page (`apps/web/app/(app)/history/page.tsx`) renders a **`DisplayEntry`** (`HistoryEntry` from `@/lib/storage/history` + `source`), where **`createdAt` is a `number`** (ms timestamp), `courseId` is `string | null`. The grouping helper is therefore **generic over `{ courseId: string | null; createdAt: number }`** so it fits the page's entries directly (do NOT use the shared `HistoryEntry` whose `createdAt` is a string).

---

### Task 1: `groupHistoryByClass` helper + unit test (TDD)

**Files:**
- Create: `apps/web/lib/group-history.ts`
- Create: `apps/web/tests/unit/group-history.test.ts`

- [ ] **Step 1: Write the failing test.** Create `apps/web/tests/unit/group-history.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { groupHistoryByClass } from '@/lib/group-history';
import { findCourse } from '@composed-prompts/shared';

// minimal entry: just the fields the helper uses, plus an id to track identity
const e = (id: string, courseId: string | null, createdAt: number) => ({ id, courseId, createdAt });

describe('groupHistoryByClass', () => {
  it('returns [] for no entries', () => {
    expect(groupHistoryByClass([])).toEqual([]);
  });

  it('groups entries by courseId with a count', () => {
    const groups = groupHistoryByClass([
      e('a', 'science-biology', 200),
      e('b', 'science-biology', 100),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe('science-biology');
    expect(groups[0]!.count).toBe(2);
    expect(groups[0]!.entries.map((x) => x.id)).toEqual(['a', 'b']); // input order preserved
    expect(groups[0]!.label).toBe(findCourse('science-biology')?.name ?? 'science-biology');
  });

  it('puts null-courseId entries in a single "Other" group labeled Other', () => {
    const groups = groupHistoryByClass([e('a', null, 100), e('b', null, 50)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe('other');
    expect(groups[0]!.label).toBe('Other');
    expect(groups[0]!.count).toBe(2);
  });

  it('orders groups by most-recent activity, with Other always last', () => {
    const groups = groupHistoryByClass([
      e('old', 'science-biology', 100),
      e('new', 'arts-acting-and-improv', 300),
      e('other-newest', null, 999), // most recent overall, but Other must still be last
    ]);
    expect(groups.map((g) => g.key)).toEqual(['arts-acting-and-improv', 'science-biology', 'other']);
  });
});
```

- [ ] **Step 2: Run it — verify FAIL.**

Run: `cd /Users/likerun/Desktop/prompt/apps/web && npx vitest run tests/unit/group-history.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.** Create `apps/web/lib/group-history.ts`:

```ts
import { findCourse } from '@composed-prompts/shared';

export type HistoryGroup<T> = { key: string; label: string; count: number; entries: T[] };

const OTHER = 'other';

export function groupHistoryByClass<T extends { courseId: string | null; createdAt: number }>(
  entries: T[],
): HistoryGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const entry of entries) {
    const key = entry.courseId ?? OTHER;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(entry);
    else buckets.set(key, [entry]);
  }

  const groups: HistoryGroup<T>[] = [...buckets.entries()].map(([key, es]) => ({
    key,
    label: key === OTHER ? 'Other' : findCourse(key)?.name ?? key,
    count: es.length,
    entries: es,
  }));

  // Newest activity first; the "Other" group is always pinned last.
  groups.sort((a, b) => {
    if (a.key === OTHER) return 1;
    if (b.key === OTHER) return -1;
    const aNewest = Math.max(...a.entries.map((x) => x.createdAt));
    const bNewest = Math.max(...b.entries.map((x) => x.createdAt));
    return bNewest - aNewest;
  });

  return groups;
}
```

- [ ] **Step 4: Run it — verify PASS.**

Run: `cd /Users/likerun/Desktop/prompt/apps/web && npx vitest run tests/unit/group-history.test.ts && npx tsc --noEmit`
Expected: 4/4 pass; tsc clean. (If `findCourse('science-biology')`/`'arts-acting-and-improv'` aren't in the catalog and the label test fails, use two course ids that DO exist — check `packages/shared/src/courses.ts` — and keep the `findCourse(id)?.name` form so the assertion isn't brittle.)

- [ ] **Step 5: Commit.**

```bash
git add apps/web/lib/group-history.ts apps/web/tests/unit/group-history.test.ts
git commit -m "feat(web): groupHistoryByClass helper (per-class blocks, Other last)"
```

---

### Task 2: Render grouped sections on the History page

**Files:**
- Modify: `apps/web/app/(app)/history/page.tsx:66-88` (the signed-in/has-entries render block — the `<ul>` that maps `entries`)

- [ ] **Step 1: Replace the flat list with grouped sections.** Add the import at the top with the other `@/lib` imports:

```tsx
import { groupHistoryByClass } from '@/lib/group-history';
```

Then replace the `<ul className="mt-6 grid gap-3"> … </ul>` block (currently mapping `entries` directly) with grouped sections. The `HistoryRow` usage + the `onRate` logic are unchanged — only the wrapping structure changes:

```tsx
      <div className="mt-6 space-y-8">
        {groupHistoryByClass(entries).map((group) => (
          <section key={group.key}>
            <h2 className="mb-3 flex items-baseline gap-2">
              <span className="font-serif text-lg font-semibold text-foreground">{group.label}</span>
              <span className="text-xs uppercase tracking-wide text-muted-foreground">
                {group.count} prompt{group.count === 1 ? '' : 's'}
              </span>
            </h2>
            <ul className="grid gap-3">
              {group.entries.map((e) => (
                <HistoryRow
                  key={e.id}
                  entry={e}
                  onRate={(r) => {
                    if (e.source === 'local') rateHistoryEntry(e.id, r);
                  }}
                />
              ))}
            </ul>
          </section>
        ))}
      </div>
```

Leave the `<h1>Past prompts</h1>`, the sub-paragraph, the loading state, the empty state, and the entire `HistoryRow` + `RatingButtons` components **unchanged**. (The per-card "course · mode" line stays — minor, acceptable redundancy with the section header.)

- [ ] **Step 2: Verify types + tests + build.**

Run: `cd /Users/likerun/Desktop/prompt/apps/web && npx tsc --noEmit && npx vitest run && npm run build`
Expected: tsc clean; full web suite green (incl. the new group-history test); build succeeds, `/history` still in the route table. (If a stale `.next/types` error appears, `rm -rf apps/web/.next` and re-run.)

- [ ] **Step 3: Zombie check.** `git status --short` — if `apps/web/app/about/` or `apps/web/components/RagPanel.tsx` reappear untracked, `rm -rf` them.

- [ ] **Step 4: Commit.**

```bash
git add "apps/web/app/(app)/history/page.tsx"
git commit -m "feat(web): group History prompts into per-class sections"
```

---

### Task 3: Visual check

- [ ] **Step 1: `/browse` the History page** (signed in, with a few prompts across ≥2 classes): confirm each class is a section (serif label + "N prompts" count), the most-recently-used class is first, an "Other" section (if any free-text prompts) sits last, and each card still expands + shows its rating. Mobile width: sections stack cleanly.

---

## Self-Review

**Spec coverage:** ✅ helper with group-by-courseId + "Other"/null + most-recent-first + Other-last + count + empty→[] (Task 1, with unit tests); sectioned rendering reusing the entry cards (Task 2); frontend-only, no backend/deps; verify build+vitest+tsc+/browse (Tasks 2–3).

**Placeholder scan:** none — full helper code, full test, exact render block.

**Type consistency:** `groupHistoryByClass<T extends { courseId: string | null; createdAt: number }>` is generic and accepts the page's `DisplayEntry` (which has `courseId: string | null` and `createdAt: number` + `source` for `onRate`); `HistoryGroup<T>` shape (`key`/`label`/`count`/`entries`) is used identically in the helper, test, and page; the test's `e()` factory provides exactly the fields the helper reads.
