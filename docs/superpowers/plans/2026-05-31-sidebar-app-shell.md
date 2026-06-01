# Sidebar App-Shell + Dashboard Implementation Plan (Phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wrap the signed-in app (Dashboard / History / Study plan / Account) in a Wispr-style sidebar shell, with a "Welcome back" dashboard; landing + wizard stay full-bleed.

**Architecture:** A Next.js App Router route group `app/(app)/` whose `layout.tsx` renders `<Sidebar/>` + main; history/account/plan move into it (URLs unchanged — route groups don't affect paths); a new dashboard lives at `/dashboard`. Signed-in `/` redirects to `/dashboard`; the global header moves off root onto the landing + a new wizard layout. Three dashboard stats compute client-side from `/api/me/history` (one additive field added to that endpoint). Editorial Calm tokens already exist.

**Tech Stack:** Next.js 14 App Router, Tailwind + shadcn/ui, Clerk (`auth()`, `useUser`, `SignOutButton`, `SignedIn/SignedOut`), Hono + Drizzle (the one backend field), Vitest.

---

## Notes for all tasks
- Work on `main`. Editorial Calm tokens (`bg-card`, `text-foreground`, `text-muted-foreground`, `bg-primary`, `border-border`, `bg-accent`, `font-serif`, `rounded-2xl`, `rounded-full`, `shadow-soft`) already exist — use them.
- **No new npm deps** (icons are inline SVG). No DB schema change.
- After moving files, watch for reappearing **zombie files** (`apps/web/app/about/`, `apps/web/components/RagPanel.tsx`) — if they reappear untracked, `rm -rf` them (they were intentionally deleted in commit `1483c7c`).

---

### Task 1: Add `assessmentType` + `assessmentDate` to the history endpoint

**Files:**
- Modify: `packages/shared/src/api-contracts.ts:37-47` (`HistoryEntry` type)
- Modify: `apps/api/src/routes/me.ts:53-90` (the `/api/me/history` handler)
- Modify: `apps/api/tests/integration/history-route.test.ts`

- [ ] **Step 1: Extend the type.** In `packages/shared/src/api-contracts.ts`, add two fields to `HistoryEntry` (after `courseId`):

```ts
  courseId: string | null;
  assessmentType: string | null;
  assessmentDate: string | null;  // ISO date 'YYYY-MM-DD' or null
  rating: number | null;
```

- [ ] **Step 2: Update the existing route test to expect the fields.** In `apps/api/tests/integration/history-route.test.ts`, find the test that seeds a generation and asserts the returned entry shape. The seeded generation's `inputsJson` should already contain `assessmentType` and `assessmentDate` (it's the wizard inputs). Add assertions to the happy-path test, e.g.:

```ts
expect(entry.assessmentType).toBe('test');
expect(entry.assessmentDate).toBe('2026-06-10');
```

(Match the `assessmentType`/`assessmentDate` values the test's seeded `inputsJson` uses — read the seed and use its actual values.)

- [ ] **Step 3: Run the test to verify it FAILS.**

Run: `cd apps/api && npx vitest run tests/integration/history-route.test.ts`
Expected: FAIL — `entry.assessmentType` is `undefined`.

- [ ] **Step 4: Implement in the handler.** In `apps/api/src/routes/me.ts`, add `inputsJson` to the `.select({...})` (after `courseId: schema.generations.courseId,`):

```ts
      courseId: schema.generations.courseId,
      inputsJson: schema.generations.inputsJson,
```

Then in the `entries: rows.map((r) => ({ ... }))` block, add the two fields (after `courseId: r.courseId,`):

```ts
      courseId: r.courseId,
      assessmentType: (r.inputsJson as { assessmentType?: string } | null)?.assessmentType ?? null,
      assessmentDate: (r.inputsJson as { assessmentDate?: string } | null)?.assessmentDate ?? null,
```

(`inputsJson` is the redacted-at-rest wizard inputs; redaction only strips material/understanding/confusion, so `assessmentType`/`assessmentDate` are present.)

- [ ] **Step 5: Run the test to verify it PASSES.**

Run: `cd apps/api && npx vitest run tests/integration/history-route.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 6: Commit.**

```bash
git add packages/shared/src/api-contracts.ts apps/api/src/routes/me.ts apps/api/tests/integration/history-route.test.ts
git commit -m "feat(api): include assessmentType + assessmentDate in /api/me/history"
```

---

### Task 2: Dashboard stats pure util (+ unit test)

The streak logic is fiddly — TDD it as a pure function so the dashboard page stays simple.

**Files:**
- Create: `apps/web/lib/dashboard-stats.ts`
- Create: `apps/web/tests/unit/dashboard-stats.test.ts`

- [ ] **Step 1: Write the failing test.** Create `apps/web/tests/unit/dashboard-stats.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeDashboardStats } from '@/lib/dashboard-stats';

// Helper: an entry with just the fields the stats use.
const e = (createdAt: string, assessmentDate: string | null = null) =>
  ({ createdAt, assessmentDate } as any);

describe('computeDashboardStats', () => {
  it('counts prompts from total, not the page size', () => {
    const s = computeDashboardStats([e('2026-05-31T10:00:00Z')], 42, new Date('2026-05-31T12:00:00Z'));
    expect(s.promptsMade).toBe(42);
  });

  it('day streak counts consecutive days ending today', () => {
    const now = new Date('2026-05-31T12:00:00Z');
    const entries = [e('2026-05-31T09:00:00Z'), e('2026-05-30T09:00:00Z'), e('2026-05-29T09:00:00Z'), e('2026-05-27T09:00:00Z')];
    expect(computeDashboardStats(entries, 4, now).dayStreak).toBe(3); // 31,30,29 — breaks at the 28 gap
  });

  it('day streak still counts when the most recent day is yesterday', () => {
    const now = new Date('2026-05-31T12:00:00Z');
    const entries = [e('2026-05-30T09:00:00Z'), e('2026-05-29T09:00:00Z')];
    expect(computeDashboardStats(entries, 2, now).dayStreak).toBe(2);
  });

  it('day streak is 0 when newest activity is older than yesterday', () => {
    const now = new Date('2026-05-31T12:00:00Z');
    expect(computeDashboardStats([e('2026-05-25T09:00:00Z')], 1, now).dayStreak).toBe(0);
  });

  it('next assessment is the soonest future date', () => {
    const now = new Date('2026-05-31T12:00:00Z');
    const entries = [e('2026-05-31T09:00:00Z', '2026-06-20'), e('2026-05-30T09:00:00Z', '2026-06-05'), e('2026-05-29T09:00:00Z', '2026-05-01')];
    expect(computeDashboardStats(entries, 3, now).nextAssessment).toBe('2026-06-05'); // 06-05 is soonest future; 05-01 is past
  });

  it('next assessment is null when none are in the future', () => {
    const now = new Date('2026-05-31T12:00:00Z');
    expect(computeDashboardStats([e('2026-05-29T09:00:00Z', '2026-05-01')], 1, now).nextAssessment).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — verify FAIL.**

Run: `cd apps/web && npx vitest run tests/unit/dashboard-stats.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement.** Create `apps/web/lib/dashboard-stats.ts`:

```ts
import type { HistoryEntry } from '@composed-prompts/shared';

export type DashboardStats = {
  promptsMade: number;
  dayStreak: number;
  nextAssessment: string | null; // ISO 'YYYY-MM-DD'
};

// A local YYYY-MM-DD key for a date.
const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function computeDashboardStats(
  entries: Pick<HistoryEntry, 'createdAt' | 'assessmentDate'>[],
  total: number,
  now: Date,
): DashboardStats {
  // Day streak: consecutive calendar days with >=1 entry, ending today or yesterday.
  const days = new Set(entries.map((e) => dayKey(new Date(e.createdAt))));
  let streak = 0;
  const cursor = new Date(now);
  // Allow the streak to start at today OR yesterday (so "studied yesterday" still counts today).
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  // Next assessment: soonest assessmentDate strictly after today.
  const todayKey = dayKey(now);
  const future = entries
    .map((e) => e.assessmentDate)
    .filter((d): d is string => !!d && d > todayKey)
    .sort();
  const nextAssessment = future[0] ?? null;

  return { promptsMade: total, dayStreak: streak, nextAssessment };
}
```

- [ ] **Step 4: Run — verify PASS.**

Run: `cd apps/web && npx vitest run tests/unit/dashboard-stats.test.ts && npx tsc --noEmit`
Expected: PASS; tsc clean.

- [ ] **Step 5: Commit.**

```bash
git add apps/web/lib/dashboard-stats.ts apps/web/tests/unit/dashboard-stats.test.ts
git commit -m "feat(web): dashboard stats util (prompts/streak/next-assessment)"
```

---

### Task 3: Sidebar component

**Files:**
- Create: `apps/web/components/Sidebar.tsx`

- [ ] **Step 1: Implement.** Create `apps/web/components/Sidebar.tsx` (client). Inline-SVG line icons; active state via `usePathname()`; sage "New prompt"; user + sign-out (signed-in) / sign-in (signed-out); mobile hamburger → drawer. Editorial Calm tokens.

```tsx
'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { SignedIn, SignedOut, SignInButton, SignOutButton, useUser } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';

const icons = {
  dashboard: <path d="M3 11l9-8 9 8M5 10v9h14v-9" />,
  history: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  plan: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 9h18M8 3v4M16 3v4" /></>,
  account: <><circle cx="12" cy="8" r="4" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" /></>,
} as const;

const NAV = [
  { href: '/dashboard', label: 'Dashboard', icon: 'dashboard' },
  { href: '/history', label: 'History', icon: 'history' },
  { href: '/plan', label: 'Study plan', icon: 'plan' },
  { href: '/account', label: 'Account', icon: 'account' },
] as const;

function NavLinks({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  return (
    <nav className="flex flex-col gap-0.5">
      {NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(`${item.href}/`);
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition-colors ${
              active ? 'bg-accent font-medium text-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground'
            }`}
          >
            <svg viewBox="0 0 24 24" className="h-[18px] w-[18px] shrink-0" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              {icons[item.icon]}
            </svg>
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}

function Panel({ onNavigate }: { onNavigate?: () => void }) {
  const { user } = useUser();
  return (
    <div className="flex h-full flex-col p-4">
      <Link href="/dashboard" onClick={onNavigate} className="px-2 pb-4 font-serif text-xl font-semibold tracking-tight text-foreground">
        Composed
      </Link>
      <p className="px-3 pb-2 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Menu</p>
      <NavLinks onNavigate={onNavigate} />
      <Button asChild className="mt-4 rounded-full">
        <Link href="/wizard" onClick={onNavigate}>+ New prompt</Link>
      </Button>
      <div className="mt-auto pt-4">
        <SignedIn>
          <div className="flex items-center justify-between gap-2 px-2 text-sm">
            <span className="truncate text-foreground">{user?.firstName ?? user?.primaryEmailAddress?.emailAddress ?? 'You'}</span>
            <SignOutButton><button type="button" className="text-xs text-muted-foreground hover:text-foreground">Sign out</button></SignOutButton>
          </div>
        </SignedIn>
        <SignedOut>
          <SignInButton mode="modal"><Button variant="outline" size="sm" className="w-full rounded-full">Sign in</Button></SignInButton>
        </SignedOut>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [open, setOpen] = useState(false);
  return (
    <>
      {/* Mobile top bar */}
      <div className="flex items-center justify-between border-b border-border bg-card px-4 py-3 md:hidden">
        <Link href="/dashboard" className="font-serif text-lg font-semibold text-foreground">Composed</Link>
        <button type="button" aria-label="Open menu" onClick={() => setOpen(true)} className="text-foreground">
          <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
        </button>
      </div>
      {/* Mobile drawer */}
      {open && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => setOpen(false)} aria-hidden />
          <div className="absolute left-0 top-0 h-full w-64 bg-card shadow-soft"><Panel onNavigate={() => setOpen(false)} /></div>
        </div>
      )}
      {/* Desktop docked */}
      <aside className="hidden w-60 shrink-0 border-r border-border bg-card md:block">
        <Panel />
      </aside>
    </>
  );
}
```

- [ ] **Step 2: Verify.** `cd apps/web && npx tsc --noEmit` → no errors.
- [ ] **Step 3: Commit.** `git add apps/web/components/Sidebar.tsx && git commit -m "feat(web): Sidebar component (nav + new prompt + mobile drawer)"`

---

### Task 4: The `(app)` shell layout + move history/account/plan into it

**Files:**
- Create: `apps/web/app/(app)/layout.tsx`
- Move: `apps/web/app/history` → `apps/web/app/(app)/history`
- Move: `apps/web/app/account` → `apps/web/app/(app)/account`
- Move: `apps/web/app/plan` → `apps/web/app/(app)/plan`

- [ ] **Step 1: Create the shell layout.** `apps/web/app/(app)/layout.tsx`:

```tsx
import { Sidebar } from '@/components/Sidebar';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <Sidebar />
      <main className="flex-1 px-6 py-8 md:px-10 md:py-10">
        <div className="mx-auto max-w-3xl">{children}</div>
      </main>
    </div>
  );
}
```

- [ ] **Step 2: Move the three page dirs with `git mv`** (preserves history; route groups keep the URLs `/history`, `/account`, `/plan`):

```bash
cd /Users/likerun/Desktop/prompt
git mv apps/web/app/history "apps/web/app/(app)/history"
git mv apps/web/app/account "apps/web/app/(app)/account"
git mv apps/web/app/plan "apps/web/app/(app)/plan"
```

- [ ] **Step 3: Fix any now-stale relative imports.** The moved pages may import via `@/...` (alias — unaffected) or relative paths (now wrong, one level deeper). Grep each moved page for relative imports and fix: `grep -rnE "from '\.\.?/" "apps/web/app/(app)"`. Most imports use the `@/` alias and need no change.

- [ ] **Step 4: Verify URLs still resolve.** `cd apps/web && npx tsc --noEmit && npm run build` → build succeeds; the route table still lists `/history`, `/account`, `/plan` (now under the group) — no 404s, no duplicate routes.

- [ ] **Step 5: Commit.** `git add -A apps/web/app && git commit -m "feat(web): (app) shell layout + move history/account/plan into it"`

---

### Task 5: The dashboard page

**Files:**
- Create: `apps/web/app/(app)/dashboard/page.tsx`

- [ ] **Step 1: Implement.** Create `apps/web/app/(app)/dashboard/page.tsx` (client — it fetches + computes stats). Reuse `useApi`, the `HistoryResponse` type, and `computeDashboardStats`. Pattern mirrors the existing history page's fetch.

```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useAuth, useUser } from '@clerk/nextjs';
import { useApi } from '@/lib/use-api';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { computeDashboardStats, type DashboardStats } from '@/lib/dashboard-stats';
import { findCourse, type HistoryResponse, type HistoryEntry } from '@composed-prompts/shared';

const fmtDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const relTime = (iso: string) => {
  const days = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

export default function DashboardPage() {
  const { isLoaded, isSignedIn } = useAuth();
  const { user } = useUser();
  const { apiGet } = useApi();
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);
  const [stats, setStats] = useState<DashboardStats | null>(null);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    apiGet<HistoryResponse>('/api/me/history?limit=50')
      .then((res) => {
        setEntries(res.entries);
        setStats(computeDashboardStats(res.entries, res.total, new Date()));
      })
      .catch(() => { setEntries([]); setStats({ promptsMade: 0, dayStreak: 0, nextAssessment: null }); });
  }, [isLoaded, isSignedIn, apiGet]);

  if (isLoaded && !isSignedIn) {
    return (
      <div>
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground">Welcome to Composed</h1>
        <p className="mt-2 text-muted-foreground">Sign in to see your dashboard.</p>
        <Button asChild className="mt-6 rounded-full"><Link href="/wizard">+ New prompt</Link></Button>
      </div>
    );
  }

  const statCards: { label: string; value: string }[] = [
    { label: 'Prompts made', value: String(stats?.promptsMade ?? '—') },
    { label: 'Day streak', value: String(stats?.dayStreak ?? '—') },
    { label: 'Next assessment', value: stats?.nextAssessment ? fmtDate(stats.nextAssessment) : '—' },
  ];

  return (
    <div>
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-serif text-3xl font-semibold tracking-tight text-foreground">
          Welcome back{user?.firstName ? `, ${user.firstName}` : ''}
        </h1>
        <Button asChild className="rounded-full"><Link href="/wizard">+ New prompt</Link></Button>
      </div>

      <div className="mt-6 grid grid-cols-3 gap-3">
        {statCards.map((s) => (
          <Card key={s.label} className="p-4">
            <div className="font-serif text-2xl text-foreground">{s.value}</div>
            <div className="mt-1 text-[11px] uppercase tracking-wide text-muted-foreground">{s.label}</div>
          </Card>
        ))}
      </div>

      <p className="mt-8 mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">Recent prompts</p>
      {entries === null && <p className="text-sm text-muted-foreground">Loading…</p>}
      {entries?.length === 0 && <p className="text-sm text-muted-foreground">No prompts yet — make your first one.</p>}
      <div className="space-y-2">
        {entries?.slice(0, 5).map((e) => {
          const course = e.courseId ? findCourse(e.courseId)?.name ?? e.courseId : 'Free-text class';
          return (
            <Link key={e.id} href={`/history`} className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3 hover:bg-muted">
              <div>
                <div className="text-sm font-medium text-foreground">{course}{e.assessmentType ? ` · ${e.assessmentType}` : ''}</div>
                <div className="text-xs text-muted-foreground">{relTime(e.createdAt)}</div>
              </div>
              <span className="text-muted-foreground">›</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
```

(`findCourse` is exported from the shared barrel — the history page already uses it. If `HistoryEntry` isn't exported from the barrel, import the type from `@composed-prompts/shared` where the other contracts are exported; confirm and adjust the import path.)

- [ ] **Step 2: Verify.** `cd apps/web && npx tsc --noEmit` → no errors.
- [ ] **Step 3: Commit.** `git add "apps/web/app/(app)/dashboard/page.tsx" && git commit -m "feat(web): Welcome-back dashboard (stats + recent prompts)"`

---

### Task 6: Header restructure + signed-in `/` → `/dashboard`

**Files:**
- Modify: `apps/web/app/layout.tsx` (remove global `ShowcaseHeader`)
- Modify: `apps/web/app/page.tsx` (landing → header + signed-in redirect)
- Create: `apps/web/app/wizard/layout.tsx` (header for the wizard)

- [ ] **Step 1: Remove the global header from root layout.** In `apps/web/app/layout.tsx`, delete the `import { ShowcaseHeader }` line and the `<ShowcaseHeader />` element inside `<body>` (leave everything else — ClerkProvider, fonts, `{children}`).

- [ ] **Step 2: Landing renders the header + redirects signed-in users.** Replace `apps/web/app/page.tsx` with a server component that redirects signed-in users to `/dashboard` and otherwise shows the header + landing:

```tsx
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { auth } from '@clerk/nextjs/server';
import { Button } from '@/components/ui/button';
import { ShowcaseHeader } from '@/components/ShowcaseHeader';

export default async function HomePage() {
  const { userId } = await auth();
  if (userId) redirect('/dashboard');
  return (
    <>
      <ShowcaseHeader />
      <main className="mx-auto max-w-3xl px-6 py-20">
        <h1 className="font-serif text-4xl font-semibold tracking-tight text-foreground">
          Better study prompts for Pomfret students.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          Tell us your course, the assessment, and how you study best. Get back a
          prompt that&apos;s tuned to your LLM and your situation — the kind of
          prompt that gets a real study session, not a generic summary.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Link href="/wizard"><Button size="lg">Start studying</Button></Link>
          <Link href="/plan"><Button size="lg" variant="outline">Plan study time</Button></Link>
          <Link href="/history"><Button size="lg" variant="ghost">My past prompts</Button></Link>
        </div>
      </main>
    </>
  );
}
```

- [ ] **Step 3: Wizard keeps a header.** Create `apps/web/app/wizard/layout.tsx`:

```tsx
import { ShowcaseHeader } from '@/components/ShowcaseHeader';

export default function WizardLayout({ children }: { children: React.ReactNode }) {
  return (<><ShowcaseHeader />{children}</>);
}
```

- [ ] **Step 4: Verify no double chrome + build.** `cd apps/web && npx tsc --noEmit && npm run build`. Expect success. Manually reason: landing → header only; wizard → header only; `(app)` pages → sidebar only (root no longer injects a header). No page has both.

- [ ] **Step 5: Commit.** `git add apps/web/app/layout.tsx apps/web/app/page.tsx apps/web/app/wizard/layout.tsx && git commit -m "feat(web): sidebar shell chrome — header off root, signed-in / -> /dashboard"`

---

### Task 7: Whole-feature verification

- [ ] **Step 1: Full build + all tests.**

Run:
```bash
cd /Users/likerun/Desktop/prompt/apps/api && npx vitest run && npx tsc --noEmit
cd /Users/likerun/Desktop/prompt/packages/shared && npx vitest run
cd /Users/likerun/Desktop/prompt/apps/web && npm run build && npx vitest run
```
Expected: all suites green; web build succeeds; route table shows `/`, `/dashboard`, `/history`, `/account`, `/plan`, `/wizard`, `/wizard/result`, `/sign-in`, `/sign-up` (no `/about`, no duplicates).

- [ ] **Step 2: Zombie check.** `git status --short` — if `apps/web/app/about/` or `apps/web/components/RagPanel.tsx` reappeared untracked, `rm -rf` them.

- [ ] **Step 3: `/browse` visual sweep** (dev server): dashboard (stats + recent prompts), history/account/plan inside the shell with the sidebar, active nav highlight, the **+ New prompt** button → `/wizard`; landing (signed-out) + wizard show the header, not the sidebar; mobile width (390px) → hamburger opens the drawer, links close it. Confirm signed-in `/` lands on `/dashboard`.

- [ ] **Step 4: A11y check.** Sidebar nav is keyboard-tabbable; the active link has `aria-current="page"`; the mobile menu button has `aria-label="Open menu"`; the drawer scrim closes on click.

- [ ] **Step 5: Whole-feature review.** Dispatch a code reviewer over `git diff <task1^>..HEAD` for: no double chrome, no broken links from the move, the redirect can't loop, stats logic correct, no leftover hardcoded colors, presentational tokens used.

---

## Self-Review

**Spec coverage:** ✅ additive endpoint + type + test (Task 1) · stats util (Task 2) · Sidebar w/ nav+active+new-prompt+user+mobile drawer (Task 3) · `(app)` shell layout + move pages (Task 4) · dashboard w/ welcome+3 stats+recent (Task 5) · header restructure + signed-in redirect + wizard header (Task 6) · build/tests/browse/a11y/review (Task 7). Signed-out unchanged; wizard full-bleed; no schema/deps.

**Placeholder scan:** none — exact code for the endpoint, stats util (+ tests), Sidebar, shell layout, dashboard, header/redirect.

**Type consistency:** `HistoryEntry` gains `assessmentType`/`assessmentDate` (Task 1) and both are consumed in `computeDashboardStats` (Task 2) and the dashboard (Task 5); `DashboardStats` shape matches between util and page; nav `href`s match the moved routes; `computeDashboardStats(entries, total, now)` signature is identical in test, util, and caller.
