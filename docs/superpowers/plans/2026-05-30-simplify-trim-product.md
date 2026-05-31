# Simplify / Trim Product Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All implementation subagents run on Opus (per user instruction).**

**Goal:** Trim Composed to its essentials — remove the technical-intro content (How it works page + "Behind the scenes" sections + RagPanel), and make the result-page study schedule an opt-in extra.

**Architecture:** Frontend-only edits in `apps/web`. Mostly deletions; one `useState` toggle on the result page. No shared, backend, or test changes.

**Tech Stack:** React 19 / Next.js 14 (App Router), Tailwind.

**Spec:** `docs/superpowers/specs/2026-05-30-simplify-trim-product-design.md`

---

## File map

- **Modify** `apps/web/app/page.tsx` (drop How-it-works link + Behind-the-scenes box + its helper)
- **Modify** `apps/web/components/ShowcaseHeader.tsx` (drop How-it-works nav link)
- **Modify** `apps/web/app/wizard/page.tsx` (drop Behind-the-scenes section + RagPanel import/use)
- **Modify** `apps/web/app/wizard/result/page.tsx` (drop Behind-the-scenes + RagPanel; make schedule opt-in)
- **Delete** `apps/web/app/about/page.tsx`, `apps/web/components/RagPanel.tsx` (last, after all references are gone)

**Order matters:** remove all `RagPanel` imports/uses (Tasks 3, 4) and all `/about` links (Tasks 1, 2) BEFORE deleting those files (Task 5).

**Note:** This plan does NOT touch the "Opus 4.7" copy in the result-page deterministic-fallback `Alert` or the wizard `ComposingScreen` — those are handled by a separate task. Leave them as-is.

---

## Task 1: Trim the home page

**Files:** Modify `apps/web/app/page.tsx`

- [ ] **Step 1: Remove the "How it works" hero button**

In `apps/web/app/page.tsx`, delete this block (it's the 4th `<Link>` in the hero button row):
```tsx
        <Link href="/about">
          <Button size="lg" variant="ghost">
            How it works
          </Button>
        </Link>
```
The button row should now end with the "My past prompts" link followed by `</div>`.

- [ ] **Step 2: Remove the "Behind the scenes" section**

Delete the entire `<BehindTheScenes …>…</BehindTheScenes>` block (it sits between the feature-card `</section>` and the closing `</main>`):
```tsx
      <BehindTheScenes title="What you're looking at">
        <p>
          This site is a <strong>full-stack web application</strong> I built from scratch.
          The landing page is rendered by <strong>Next.js 14</strong> running on
          <strong> Vercel</strong>, styled with <strong>Tailwind CSS</strong> and
          components from <strong>shadcn/ui</strong>. Everything you see is React on the
          frontend.
        </p>
        <p className="mt-3">
          Behind the scenes the app talks to a separate <strong>Hono backend</strong>{' '}
          deployed on <strong>Fly.io</strong>, which calls{' '}
          <strong>Claude Opus 4.7</strong> via the Anthropic API to generate the actual
          prompts. Course data is parsed from Pomfret&apos;s 2026–2027 curriculum guide
          (182 courses, organized by department + level) and lives in a shared TypeScript
          package both the frontend and backend import from.
        </p>
        <p className="mt-3">
          For the full architecture walkthrough, click <strong>How it works</strong> in
          the header.
        </p>
      </BehindTheScenes>
```
After this, the `return (...)` ends with the feature-card `</section>` then `</main>`.

- [ ] **Step 3: Remove the now-unused `BehindTheScenes` helper**

Delete the entire helper function (it's the last function in the file, after `FeatureCard`):
```tsx
function BehindTheScenes({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="mt-16 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6">
      <div className="flex items-baseline gap-2">
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
          Behind the scenes
        </span>
      </div>
      <h3 className="mt-1 text-xl font-semibold">{title}</h3>
      <div className="mt-3 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}
```
The file now ends with the `FeatureCard` function. (`Link` and `Button` imports are still used by the hero; keep them.)

- [ ] **Step 4: Build**

Run: `cd apps/web && npm run build`
Expected: compiles, no unused-variable or type errors.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/page.tsx
git commit -m "chore(web): remove How-it-works link + Behind-the-scenes from home"
```

---

## Task 2: Trim the header

**Files:** Modify `apps/web/components/ShowcaseHeader.tsx`

- [ ] **Step 1: Remove the "How it works" nav link**

In `apps/web/components/ShowcaseHeader.tsx`, delete this line:
```tsx
          <Link href="/about" className="hover:text-slate-900">How it works</Link>
```
The nav now goes History → (auth buttons). `Link` is still used (History, Account), keep the import.

- [ ] **Step 2: Build**

Run: `cd apps/web && npm run build`
Expected: compiles.

- [ ] **Step 3: Commit**

```bash
git add apps/web/components/ShowcaseHeader.tsx
git commit -m "chore(web): remove How-it-works from header nav"
```

---

## Task 3: Trim the wizard page

**Files:** Modify `apps/web/app/wizard/page.tsx`

- [ ] **Step 1: Remove the RagPanel import**

Delete this import line (line 14):
```tsx
import { RagPanel } from '@/components/RagPanel';
```

- [ ] **Step 2: Remove the "Behind the scenes" section**

Delete this `<section>` (it sits just before the closing `</main>` of the wizard form, after the Back/Next button row):
```tsx
      <section className="mt-16 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6">
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
          Behind the scenes
        </span>
        <h3 className="mt-1 text-xl font-semibold">What this wizard is doing</h3>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
          <p>
            This wizard is a <strong>React state machine</strong>. Each of the 6 steps
            is a separate component (<code className="rounded bg-slate-200 px-1 py-0.5 text-xs">ModelPicker</code>,{' '}
            <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">CoursePicker</code>,
            etc.) that updates a shared state object. The <strong>Next</strong> button
            is disabled until the current step&apos;s required fields are filled in.
          </p>
          <p>
            Step 2 (course picker) does a <strong>typeahead search</strong> over the 182
            Pomfret courses I parsed from the official 2026–2027 curriculum guide. The
            search scoring favors exact name matches over substring matches over
            description matches.
          </p>
          <p>
            When you click <strong>Generate prompt</strong>, the form values are
            validated with <strong>Zod</strong> (a TypeScript schema validation library)
            and sent as JSON to the backend. The same Zod schema runs on both sides, so
            the frontend and backend are guaranteed to agree on the shape of the data.
          </p>
        </div>
      </section>
```
The form's `return` now ends with the Back/Next button `</div>` then `</main>`.

- [ ] **Step 3: Remove the RagPanel from the loading screen**

In the `ComposingScreen` function, delete this block (the last child before `</main>`):
```tsx
      <div className="relative z-10 mt-16 w-full max-w-2xl">
        <RagPanel eyebrow="While we wait — the RAG learning system" />
      </div>
```
Keep the rest of `ComposingScreen` (the "composing…" animation and helper text). After this, `RagPanel` is no longer referenced anywhere in the file.

- [ ] **Step 4: Build**

Run: `cd apps/web && npm run build`
Expected: compiles, no unused-import error for RagPanel.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/wizard/page.tsx
git commit -m "chore(web): remove Behind-the-scenes + RagPanel from wizard"
```

---

## Task 4: Trim the result page + make schedule opt-in

**Files:** Modify `apps/web/app/wizard/result/page.tsx`

- [ ] **Step 1: Remove the RagPanel import**

Delete this import line (line 9):
```tsx
import { RagPanel } from '@/components/RagPanel';
```

- [ ] **Step 2: Add the opt-in toggle state**

Immediately after the existing `const [data, setData] = useState<LastResult | null>(null);` line, add:
```tsx
  const [showSchedule, setShowSchedule] = useState(false);
```
(`useState` is already imported on line 3; `Button` is already imported on line 5.)

- [ ] **Step 3: Make the schedule opt-in**

Replace the current always-on schedule block:
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
with a button that reveals it on click:
```tsx
      {data.schedule && (
        <div className="mt-8">
          {showSchedule ? (
            <StudySchedule
              assessmentDate={data.schedule.assessmentDate}
              hoursAvailable={data.schedule.hoursAvailable}
              courseLabel={data.schedule.courseLabel}
              assessmentType={data.schedule.assessmentType}
            />
          ) : (
            <Button variant="outline" onClick={() => setShowSchedule(true)}>
              Plan study time (optional)
            </Button>
          )}
        </div>
      )}
```

- [ ] **Step 4: Remove the RagPanel block**

Delete this block (it sits right after the schedule block, before the "How did this go?" feedback card):
```tsx
      <div className="mt-8">
        <RagPanel eyebrow="What happened behind that prompt — the RAG learning system" />
      </div>
```

- [ ] **Step 5: Remove the "Behind the scenes" section**

Delete the entire trailing `<section>` (the "How that prompt was just generated" block, just before the closing `</main>`):
```tsx
      <section className="mt-16 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6">
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
          Behind the scenes
        </span>
        <h3 className="mt-1 text-xl font-semibold">How that prompt was just generated</h3>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
          <p>
            That prompt was written by <strong>Claude Opus 4.7</strong>, Anthropic&apos;s
            most capable model. The wizard inputs you submitted (course, mode, time
            available, confidence, what confuses you, etc.) were sent to a backend
            service I built, which called the Anthropic API with a custom system prompt
            describing the <strong>Pomfret-Study Framework</strong> — a 7-section
            structure I designed.
          </p>
          <p>
            The 7 sections are: <strong>Role</strong> (who the tutor LLM should be),{' '}
            <strong>About Me</strong> (the student&apos;s context),{' '}
            <strong>Material</strong> (whatever was pasted), <strong>Goal</strong>{' '}
            (the assessment + time), <strong>Interaction Style</strong> (how the tutor
            should engage), <strong>Output Spec</strong> (the exact deliverable shape),
            and <strong>Self-Check</strong> (quality control).
          </p>
          <p>
            Notice that the output above is formatted with XML tags (for Claude),
            markdown headers (for GPT), or numbered steps (for Gemini) depending on
            which LLM you picked. That formatting is controlled by a{' '}
            <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">model-profiles.json</code>{' '}
            file I maintain — each model gets the format it responds to best.
          </p>
          <p>
            If Opus 4.7 is unavailable or the daily budget cap is hit, the system falls
            back to a fully deterministic version of the same prompt built from
            templates — slower-quality but always available. That&apos;s why you see the
            banner up top sometimes.
          </p>
          <p className="text-xs text-slate-500">
            One generation costs roughly $0.07 in Anthropic credits. Daily budget is
            capped at $10/day in the production environment.
          </p>
        </div>
      </section>
```
After this, the `return` ends with the `<SignedOut>…</SignedOut>` block then `</main>`. (Leave the deterministic-fallback `Alert` with its "Opus 4.7" text untouched — separate task.)

- [ ] **Step 6: Build**

Run: `cd apps/web && npm run build`
Expected: compiles; no unused-import error for `RagPanel`; `Button` + `useState` resolve.

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/wizard/result/page.tsx
git commit -m "feat(web): make result-page schedule opt-in; drop Behind-the-scenes + RagPanel"
```

---

## Task 5: Delete the orphaned files

**Files:** Delete `apps/web/app/about/page.tsx`, `apps/web/components/RagPanel.tsx`

- [ ] **Step 1: Confirm no remaining references**

Run: `cd apps/web && grep -rn "RagPanel\|/about\|about/page" app components | grep -v node_modules`
Expected: NO matches (all imports/links removed in Tasks 1–4). If anything shows up, remove it before continuing.

- [ ] **Step 2: Delete the files**

```bash
git rm apps/web/app/about/page.tsx apps/web/components/RagPanel.tsx
```

- [ ] **Step 3: Build**

Run: `cd apps/web && npm run build`
Expected: compiles; `/about` no longer appears in the route list.

- [ ] **Step 4: Commit**

```bash
git add -A apps/web/app/about apps/web/components/RagPanel.tsx
git commit -m "chore(web): delete orphaned /about page + RagPanel component"
```

---

## Task 6: Full verification

**Files:** none

- [ ] **Step 1: Build + tests**

```bash
cd apps/web && npm run build && npx vitest run
```
Expected: build compiles (no `/about` route, no RagPanel); existing web tests (`smoke.test.ts`, `storage-history.test.ts`) pass.

- [ ] **Step 2: Confirm a clean tree**

Run: `git status --short`
Expected: empty.

- [ ] **Step 3: Confirm the content is gone**

Run: `cd apps/web && grep -rn "Behind the scenes\|RagPanel\|How it works" app components | grep -v node_modules`
Expected: NO matches.

- [ ] **Step 4: [MANUAL] /browse smoke (after `git push` → Vercel)**

- Home page: hero buttons are just *Start studying / Plan study time / My past prompts*; no "How it works"; no "Behind the scenes" box.
- Header: *History / Account* (no "How it works").
- `/about`: returns 404.
- Generate a prompt → result page shows the prompt, a **"Plan study time (optional)"** button (not the full schedule), and clicking it reveals the editable schedule. No "Behind the scenes".

---

## Notes for the implementer

- **Frontend-only.** No shared/backend/test changes. No new tests (this is deletions + one toggle).
- **`apps/web` builds type-check everything** — `npm run build` is the gate after each task.
- **Leave the "Opus 4.7" copy** in the result-page deterministic `Alert` and the wizard `ComposingScreen` — a separate task updates that to 4.8; don't touch it here to avoid conflicts.
- **Watch for stray untracked files** in `apps/web` (legacy zombies have reappeared before). Do NOT create shim/stub files; if a build fails on a missing module you didn't write, report it.
