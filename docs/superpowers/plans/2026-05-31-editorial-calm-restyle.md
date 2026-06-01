# Editorial Calm Restyle — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restyle the Composed web app in the approved "Editorial Calm" design language (Newsreader serif + Inter sans, cream canvas, sage-olive accent) — a purely presentational change, no logic touched.

**Architecture:** The app is shadcn/ui — Tailwind with CSS-variable tokens in `app/globals.css` and primitives in `components/ui`. We achieve the new look by (1) **remapping the existing CSS variables** to Editorial Calm values (this instantly reskins every `ui` primitive), (2) adding the **serif font** + Inter via `next/font/google`, then (3) doing a **per-page pass** to swap hardcoded `indigo-*`/`slate-*`/`white` utility classes to the tokens and apply `font-serif` to headings. No parallel token names, no layout/logic changes.

**Tech Stack:** Next.js 14 App Router, Tailwind CSS, shadcn/ui, `next/font`, Clerk (`appearance` API), Vitest.

---

## Why no TDD here

This is a presentational restyle — there are no new units to test. **Do not write new unit tests.** "Green" for each task means: `npx tsc --noEmit` passes, the existing web Vitest suite (7 tests) still passes, and the page renders correctly. The final task runs the full build + a `/browse` visual sweep + a WCAG AA contrast check.

## The token map (single source of truth)

Editorial Calm values, applied to the existing shadcn variable names so primitives reskin automatically:

| CSS var | New value | Role |
|---|---|---|
| `--background` | `#F6F2EA` | cream canvas |
| `--foreground` | `#26261F` | ink text |
| `--card`, `--popover` | `#FFFFFF` | card surface |
| `--card-foreground`, `--popover-foreground` | `#26261F` | text on cards |
| `--primary` | `#586249` | sage accent (buttons, links) |
| `--primary-foreground` | `#EEF0E7` | text on sage |
| `--secondary` | `#FCFBF7` | warm off-white surface-alt |
| `--secondary-foreground` | `#26261F` | text on secondary |
| `--muted` | `#EFEAE0` | muted cream fill |
| `--muted-foreground` | `#8A857B` | secondary/label text |
| `--accent` | `#EEF0E7` | hover/highlight fill (sage tint) |
| `--accent-foreground` | `#26261F` | text on accent fill |
| `--destructive` | `#A23E34` | warm muted red |
| `--destructive-foreground` | `#FBF1EF` | text on destructive |
| `--border`, `--input` | `#E7E1D6` | hairline |
| `--ring` | `#586249` | sage focus ring |
| `--radius` | `0.875rem` | base radius (up from 0.5rem) |

## Per-page find→replace cheatsheet (used by every page/component task)

Apply these in each restyled file. These are the only changes — **never touch handlers, state, props, imports of logic, or data flow.**

| Find (hardcoded) | Replace with |
|---|---|
| `bg-indigo-600`, `bg-indigo-500` | `bg-primary` |
| `hover:bg-indigo-700`, `hover:bg-indigo-600` | `hover:bg-primary/90` |
| `text-indigo-600`, `text-indigo-700` | `text-primary` |
| `text-slate-900`, `text-gray-900`, `text-black`, `text-zinc-900` | `text-foreground` |
| `text-slate-600`, `text-slate-500`, `text-gray-600`, `text-gray-500` | `text-muted-foreground` |
| `border-slate-200`, `border-slate-300`, `border-gray-200` | `border-border` |
| `bg-slate-50`, `bg-slate-100`, `bg-gray-50` | `bg-muted` |
| `bg-white` (a card) | `bg-card` |
| `ring-indigo-500`, `focus:ring-indigo-*` | `ring-ring` |
| `rounded-lg` on cards | `rounded-2xl` |
| `rounded-md`/`rounded-lg` on buttons | `rounded-full` (pill) |
| page `<h1>`/`<h2>` heading | add `font-serif` |
| a raw `<button className="bg-indigo…">` | prefer the `<Button>` primitive |

Page wrappers should sit on the cream canvas (the body already gets `bg-background`); inner content max-width ~`max-w-3xl` (~760px), centered, generous padding.

---

### Task 1: Remap the CSS variables to Editorial Calm

**Files:**
- Modify: `apps/web/app/globals.css:6-40` (the `:root` block) and `:87-108` (composing animation colors)

- [ ] **Step 1: Replace the `:root` token block.** In `app/globals.css`, replace the entire `:root { ... }` block (lines 6–40) with:

```css
  :root {
    --background: #F6F2EA;
    --foreground: #26261F;
    --card: #FFFFFF;
    --card-foreground: #26261F;
    --popover: #FFFFFF;
    --popover-foreground: #26261F;
    --primary: #586249;
    --primary-foreground: #EEF0E7;
    --secondary: #FCFBF7;
    --secondary-foreground: #26261F;
    --muted: #EFEAE0;
    --muted-foreground: #8A857B;
    --accent: #EEF0E7;
    --accent-foreground: #26261F;
    --destructive: #A23E34;
    --destructive-foreground: #FBF1EF;
    --border: #E7E1D6;
    --input: #E7E1D6;
    --ring: #586249;
    --radius: 0.875rem;
    --chart-1: #586249;
    --chart-2: #8A857B;
    --chart-3: #A65A33;
    --chart-4: #4A5340;
    --chart-5: #C9B79C;
    --sidebar: #FBF9F4;
    --sidebar-foreground: #26261F;
    --sidebar-primary: #586249;
    --sidebar-primary-foreground: #EEF0E7;
    --sidebar-accent: #EEF0E7;
    --sidebar-accent-foreground: #26261F;
    --sidebar-border: #E7E1D6;
    --sidebar-ring: #586249;
  }
```

Leave the `.dark { ... }` block as-is — it is dormant (we never add the `dark` class; cream-only).

- [ ] **Step 2: Recolor the "composing" loading animation.** In `app/globals.css`, the `.composing-text` gradient uses slate `rgba(15, 23, 42, …)`. Replace those four `rgba(15, 23, 42, X)` stops with ink `rgba(38, 38, 31, X)` (keep the same alpha values 0.35/1/0.35/1/0.35). Also update the stale comment `used while Opus 4.7 is composing` → `used while Opus is composing`.

- [ ] **Step 3: Verify build compiles.**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors. (CSS changes don't affect TS, but this confirms nothing else broke.)

- [ ] **Step 4: Commit.**

```bash
git add apps/web/app/globals.css
git commit -m "feat(web): remap design tokens to Editorial Calm (cream/ink/sage)"
```

---

### Task 2: Load Newsreader + Inter and wire the type system

**Files:**
- Modify: `apps/web/app/layout.tsx`
- Modify: `apps/web/tailwind.config.ts`

- [ ] **Step 1: Swap fonts in `layout.tsx`.** Replace the Geist sans import with Google Inter + Newsreader (keep Geist mono for the prompt code block). Replace lines 1–15 with:

```tsx
import localFont from "next/font/local";
import { Inter, Newsreader } from "next/font/google";
import "./globals.css";
import { ShowcaseHeader } from "@/components/ShowcaseHeader";
import { ClerkProvider } from '@clerk/nextjs';

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", weight: ["400", "500", "600"] });
const newsreader = Newsreader({ subsets: ["latin"], variable: "--font-newsreader", weight: ["400", "500", "600"] });
const geistMono = localFont({
  src: "./fonts/GeistMonoVF.woff",
  variable: "--font-geist-mono",
  weight: "100 900",
});
```

- [ ] **Step 2: Apply fonts + sage Clerk theme in `layout.tsx`.** Replace the `<ClerkProvider …>` appearance block and the `<body>` className. The appearance becomes:

```tsx
    <ClerkProvider
      appearance={{
        variables: {
          colorPrimary: '#586249',
          fontFamily: 'var(--font-inter)',
          borderRadius: '0.75rem',
        },
      }}
    >
```

and the `<body>` tag becomes:

```tsx
        <body className={`${inter.variable} ${newsreader.variable} ${geistMono.variable} font-sans antialiased`}>
```

- [ ] **Step 3: Add `fontFamily` to Tailwind.** In `tailwind.config.ts`, inside `theme.extend` (after the `colors: { … }` block, before `borderRadius`), add:

```ts
  		fontFamily: {
  			sans: ['var(--font-inter)', 'system-ui', 'sans-serif'],
  			serif: ['var(--font-newsreader)', 'Georgia', 'serif'],
  			mono: ['var(--font-geist-mono)', 'ui-monospace', 'monospace'],
  		},
```

- [ ] **Step 4: Verify build + types.**

Run: `cd apps/web && npx tsc --noEmit && npm run build`
Expected: build succeeds; the page renders in Inter with a cream background. (`next/font/google` fetches fonts at build time — requires network during build, which Vercel/local both have.)

- [ ] **Step 5: Commit.**

```bash
git add apps/web/app/layout.tsx apps/web/tailwind.config.ts
git commit -m "feat(web): load Newsreader+Inter, set serif/sans tokens, sage Clerk theme"
```

---

### Task 3: Polish the shared `ui` primitives

**Files:**
- Modify: `apps/web/components/ui/button.tsx`
- Modify: `apps/web/components/ui/card.tsx`
- Modify: `apps/web/components/ui/input.tsx`, `textarea.tsx`

The primitives already consume the remapped vars, so colors are done. These edits make the *shape* match Editorial Calm (pill buttons, rounder cards, calm shadows).

- [ ] **Step 1: Pill buttons.** In `components/ui/button.tsx`, in the base `cva(...)` string (line 8), change `rounded-md` → `rounded-full`. In the `size` variants (lines 23–28), change the two `rounded-md` occurrences → `rounded-full`. Change the `default` variant's `shadow` → `shadow-soft` (defined in Step 4 below); keep `hover:bg-primary/90`.

- [ ] **Step 2: Calmer cards.** In `components/ui/card.tsx` line 12, change `"rounded-xl border bg-card text-card-foreground shadow"` → `"rounded-2xl border bg-card text-card-foreground shadow-soft"`.

- [ ] **Step 3: Input focus.** In `components/ui/input.tsx` and `textarea.tsx`, change `rounded-md` → `rounded-xl`. Leave `focus-visible:ring-ring` (already sage via the var).

- [ ] **Step 4: Add the `soft` shadow token.** In `tailwind.config.ts` `theme.extend`, add:

```ts
  		boxShadow: {
  			soft: '0 1px 2px rgba(0,0,0,.04), 0 12px 30px rgba(0,0,0,.05)',
  		},
```

- [ ] **Step 5: Verify.**

Run: `cd apps/web && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 6: Commit.**

```bash
git add apps/web/components/ui/button.tsx apps/web/components/ui/card.tsx apps/web/components/ui/input.tsx apps/web/components/ui/textarea.tsx apps/web/tailwind.config.ts
git commit -m "feat(web): Editorial Calm shape for ui primitives (pill buttons, rounded cards, soft shadow)"
```

---

### Task 4: Restyle the header + home

**Files:**
- Modify: `apps/web/components/ShowcaseHeader.tsx`
- Modify: `apps/web/app/page.tsx`

- [ ] **Step 1:** Read both files. Apply the **find→replace cheatsheet** throughout. Specifically: the "Composed" wordmark in `ShowcaseHeader` → `font-serif`; the home hero `<h1>` → `font-serif text-foreground`, subtext → `text-muted-foreground`; primary CTA → `<Button>` (or `bg-primary … rounded-full`); any feature cards → `bg-card rounded-2xl border-border shadow-soft`; page wrapper sits on the cream canvas with `max-w-3xl mx-auto`.
- [ ] **Step 2:** Verify: `cd apps/web && npx tsc --noEmit` (no errors).
- [ ] **Step 3:** Commit: `git add apps/web/components/ShowcaseHeader.tsx apps/web/app/page.tsx && git commit -m "feat(web): restyle header + home (Editorial Calm)"`

---

### Task 5: Restyle the wizard shell + step components

**Files:**
- Modify: `apps/web/app/wizard/page.tsx`
- Modify: `apps/web/components/CoursePicker.tsx`, `AboutMeStep.tsx`, `MaterialStep.tsx`, `AssessmentStep.tsx`, `ModePicker.tsx`, `ModelPicker.tsx`

- [ ] **Step 1:** Read each file. Apply the cheatsheet. Step headings → `font-serif`; selection cards/options (course/mode/model pickers) → `bg-card rounded-2xl border-border` with the active state using `border-primary` + `bg-accent` (sage tint) instead of indigo; next/back buttons → `<Button>` variants (primary = default, back = `outline`/`ghost`); progress indicator uses `bg-primary`. Inputs/textareas already inherit. **Do not change step logic, validation, or the wizard state machine.**
- [ ] **Step 2:** Verify: `cd apps/web && npx tsc --noEmit` (no errors).
- [ ] **Step 3:** Commit: `git add apps/web/app/wizard/page.tsx apps/web/components/CoursePicker.tsx apps/web/components/AboutMeStep.tsx apps/web/components/MaterialStep.tsx apps/web/components/AssessmentStep.tsx apps/web/components/ModePicker.tsx apps/web/components/ModelPicker.tsx && git commit -m "feat(web): restyle wizard + step components (Editorial Calm)"`

---

### Task 6: Restyle the result page + prompt output + Sharpen panel

**Files:**
- Modify: `apps/web/app/wizard/result/page.tsx`
- Modify: `apps/web/components/PromptOutput.tsx`
- Modify: `apps/web/components/SharpenPanel.tsx`

This page was mocked and approved — match it: serif H1 "Your study prompt is ready", prompt in a `bg-card rounded-2xl shadow-soft` card with a ghost **Copy** button, the Sharpen panel as a `bg-secondary` (surface-alt) card with the sage CTA, the "Plan study time" row as a calm card.

- [ ] **Step 1:** Read all three. Apply the cheatsheet. In `SharpenPanel.tsx`: the `btn` constant (`bg-indigo-600 … hover:bg-indigo-700`) → `bg-primary … hover:bg-primary/90 rounded-full`; the `text-indigo-600 underline` toggle links → `text-primary`; `text-slate-*` → `text-muted-foreground`/`text-foreground`; the panel container `border bg-white` → `bg-secondary border-border rounded-2xl`. In `PromptOutput.tsx`: the prompt container → `bg-card rounded-2xl border-border`; keep the `font-mono` on the prompt text; Copy button → ghost `<Button variant="outline">` (pill). Result page H1 → `font-serif`.
- [ ] **Step 2:** Verify: `cd apps/web && npx tsc --noEmit` (no errors).
- [ ] **Step 3:** Commit: `git add apps/web/app/wizard/result/page.tsx apps/web/components/PromptOutput.tsx apps/web/components/SharpenPanel.tsx && git commit -m "feat(web): restyle result page + PromptOutput + SharpenPanel (Editorial Calm)"`

---

### Task 7: Restyle the history page

**Files:**
- Modify: `apps/web/app/history/page.tsx`

- [ ] **Step 1:** Read it. Apply the cheatsheet. Page `<h1>` → `font-serif`; each history entry → a calm card (`bg-card rounded-2xl border-border shadow-soft`) or timeline row with a muted timestamp label (`text-muted-foreground` uppercase `.text-xs tracking-wide`); empty state in `text-muted-foreground`. **No change to data loading.**
- [ ] **Step 2:** Verify: `cd apps/web && npx tsc --noEmit` (no errors).
- [ ] **Step 3:** Commit: `git add apps/web/app/history/page.tsx && git commit -m "feat(web): restyle history page (Editorial Calm)"`

---

### Task 8: Restyle the account page + CalendarConnect + FeedbackForm

**Files:**
- Modify: `apps/web/app/account/page.tsx`
- Modify: `apps/web/components/CalendarConnect.tsx`
- Modify: `apps/web/components/FeedbackForm.tsx`

- [ ] **Step 1:** Read all three. Apply the cheatsheet. Render account settings as Wispr-style **setting rows**: a `bg-card rounded-2xl border-border` group where each row is `flex items-center justify-between` with a bold `text-foreground` label + `text-muted-foreground` description on the left and a right-aligned ghost `<Button variant="outline">` (pill). `CalendarConnect`'s connect button → `<Button>` (sage); status text → `text-muted-foreground`. `FeedbackForm` → tokens; submit → `<Button>`. Account page `<h1>` → `font-serif`.
- [ ] **Step 2:** Verify: `cd apps/web && npx tsc --noEmit` (no errors).
- [ ] **Step 3:** Commit: `git add apps/web/app/account/page.tsx apps/web/components/CalendarConnect.tsx apps/web/components/FeedbackForm.tsx && git commit -m "feat(web): restyle account + CalendarConnect + FeedbackForm (Editorial Calm)"`

---

### Task 9: Restyle the plan page + StudySchedule

**Files:**
- Modify: `apps/web/app/plan/page.tsx`
- Modify: `apps/web/components/StudySchedule.tsx`

- [ ] **Step 1:** Read both. Apply the cheatsheet. Page `<h1>` → `font-serif`; each study block / schedule row → calm card; the "Add to calendar" / `.ics` download button → `<Button>` (sage); editable time fields use the restyled `Input`. **Do not change the schedule-building or `.ics` logic.**
- [ ] **Step 2:** Verify: `cd apps/web && npx tsc --noEmit` (no errors).
- [ ] **Step 3:** Commit: `git add apps/web/app/plan/page.tsx apps/web/components/StudySchedule.tsx && git commit -m "feat(web): restyle plan page + StudySchedule (Editorial Calm)"`

---

### Task 10: Auth pages + whole-app verification

**Files:**
- Check: `apps/web/app/sign-in/[[...sign-in]]/page.tsx`, `apps/web/app/sign-up/[[...sign-up]]/page.tsx`

- [ ] **Step 1:** Read the two auth pages. The Clerk widget is themed globally via `appearance` (Task 2), so usually only the surrounding page wrapper needs the cream canvas + a serif heading if present. Apply the cheatsheet to any wrapper markup. If the Clerk card needs minor alignment on cream, add `appearance={{ elements: { card: 'shadow-soft' } }}` on the `<SignIn/>`/`<SignUp/>` component — scoped, optional.

- [ ] **Step 2: Full build + tests.**

Run: `cd apps/web && npm run build && npx vitest run`
Expected: build succeeds (all static pages generate); 7/7 Vitest tests pass.

- [ ] **Step 3: Visual QA via `/browse`.** Start the local dev server (`cd apps/web && npm run dev`) and use the `/browse` skill to screenshot each page at desktop (1280px) and mobile (390px): `/`, `/wizard`, `/wizard/result` (seed `sessionStorage['pomfret.lastResult']` if needed), `/history`, `/account`, `/plan`, `/sign-in`. Confirm: cream canvas everywhere, serif headings, sage buttons, no leftover indigo/slate, no broken layouts at mobile width.

- [ ] **Step 4: WCAG AA contrast check.** Verify these pairings clear AA (≥4.5:1 for body text, ≥3:1 for large/UI): ink `#26261F` on cream `#F6F2EA` (passes, ~12:1); muted `#8A857B` on cream (verify — if a body-text use is < 4.5:1, darken muted to `#736E64` for that use); `#EEF0E7` text on sage `#586249` button (passes). Note `text-primary` (sage) as a *link/text* color on cream is ~4.0:1 — acceptable for large/UI but for small body links use `text-foreground` underline instead, or darken to `--accent-hover #4A5340`.

- [ ] **Step 5: Commit any auth tweaks.**

```bash
git add apps/web/app/sign-in apps/web/app/sign-up
git commit -m "feat(web): cream auth pages + Editorial Calm verification pass"
```

- [ ] **Step 6: Final whole-restyle review.** Dispatch a code-quality reviewer over the full diff (`git diff <first-restyle-commit>^..HEAD -- apps/web`) to confirm: no logic/handler/state changes slipped in, no hardcoded indigo/slate remain, tokens used consistently, no `bg-white`/`text-slate-*` leftovers.

---

## Self-Review

**Spec coverage:** ✅ tokens (Task 1) · fonts/Tailwind/Clerk (Task 2) · ui primitives (Task 3) · home+header (4) · wizard+steps (5) · result+PromptOutput+SharpenPanel (6) · history (7) · account+CalendarConnect+FeedbackForm (8) · plan+StudySchedule (9) · auth + build + tests + `/browse` + contrast (10). Phase 2 (sidebar) correctly excluded. No new deps beyond the two fonts.

**Placeholder scan:** No TBDs; the cheatsheet + token map make each page task concrete (find→replace rules + per-file specifics + exact verify commands).

**Consistency:** Variable names match the existing shadcn set throughout; `shadow-soft`, `font-serif`, `bg-primary`, `bg-card`, `rounded-2xl`, `rounded-full` are defined in Tasks 1–3 and reused consistently in Tasks 4–10.
