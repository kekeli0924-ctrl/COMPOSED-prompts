# Simplify: Remove Technical-Intro Content + Make Scheduling Optional — Design Spec

**Date:** 2026-05-30
**Status:** Approved (brainstorming) → ready for implementation plan
**Product:** Composed (Pomfret study-prompt generator)

## Context

Two simplification asks after the in-class presentation wrapped:

1. The technical-intro content (the "How it works" page and the "Behind the scenes" explainers) was presentation material. It's no longer needed and clutters the product.
2. The study-scheduler should be a clearly optional extra rather than auto-expanding, to keep the core experience (prompt generation) clean.

This spec also records a **rejected idea**: auto-importing other students'/teachers' availability by looking them up in the school Google Calendar (via API or a browser automation on the developer's account). Declined — it collects other people's personal schedule data without their consent, using the developer's privileged account at scale, and circumvents the IT block on programmatic calendar access (also against Google's ToS). It is not built and is out of scope. The existing scheduler needs zero calendar input, so it is unnecessary regardless.

## Goal

Trim Composed to its essentials: generate a great, LLM-tuned study prompt, with an *optional* study schedule the student can open if they want. Remove all architecture/explainer content.

## Non-goals

- No calendar reading/writing, no OAuth, no calendar-harvesting (explicitly declined above).
- No changes to prompt generation, the wizard's input steps, the shared scheduler logic (`proposeStudyBlocks` / `buildIcs`), or the backend.
- Not removing the scheduler — keeping it, just collapsed/optional on the result page.

## Decisions (settled in brainstorming)

- Delete the technical-intro surfaces: the `/about` page, the "Behind the scenes" sections, and the `RagPanel` component.
- The result-page scheduler becomes opt-in — collapsed behind a "Plan study time (optional)" button.
- Keep the standalone `/plan` page and the home-page "Plan study time" button (both already opt-in).

## Design

### 1. Remove technical-intro content

- **Delete** `apps/web/app/about/page.tsx` (the "How it works" page).
- **Remove the links to it:** the "How it works" nav item in `apps/web/components/ShowcaseHeader.tsx` (line 16), and the "How it works" button in the home hero (`apps/web/app/page.tsx`).
- **Remove the "Behind the scenes" sections** on:
  - `apps/web/app/page.tsx` — the dashed explainer box (the Next.js / Vercel / Hono / Opus / course-data walkthrough), plus its "click How it works" sentence.
  - `apps/web/app/wizard/page.tsx` — the "Behind the scenes" section (around line 231).
  - `apps/web/app/wizard/result/page.tsx` — the "How that prompt was just generated" section.
- **Delete** `apps/web/components/RagPanel.tsx` and remove its two uses: `apps/web/app/wizard/page.tsx` (line 314) and `apps/web/app/wizard/result/page.tsx`.
- No tests reference any of these surfaces, so no test changes are required.

Resulting surface: header = *Composed / History / Account*; home hero buttons = *Start studying / Plan study time / My past prompts*; result page = prompt + (optional) schedule + feedback. No architecture content anywhere.

### 2. Make the result-page scheduler optional

- In `apps/web/app/wizard/result/page.tsx`, the `<StudySchedule>` no longer renders inline by default. Replace the always-on block with an opt-in:
  - A button labeled **"Plan study time (optional)"**.
  - Clicking it reveals `<StudySchedule>` via a local `useState` boolean toggle; collapsed by default.
- The `data.schedule` payload still flows from the wizard (unchanged); the component simply mounts on demand. The opt-in button only renders when `data.schedule` is present (same guard as today).
- The standalone `/plan` page and the home "Plan study time" button are unchanged.

### 3. Error handling / edge cases

- If `data.schedule` is absent (e.g., an older `sessionStorage` payload from before the schedule feature), the opt-in button does not render — identical to today's conditional guard.
- No new failure modes: this is deletion plus a visibility toggle.

## Testing

- `apps/web`: `npm run build` compiles; existing Vitest suites (`smoke.test.ts`, `storage-history.test.ts`) pass.
- `/browse` smoke check: home, wizard, and result pages render with no "How it works" / "Behind the scenes" / RagPanel content; `/about` returns 404; on the result page, clicking "Plan study time (optional)" reveals the schedule editor.
- No shared or backend changes; no new unit tests (this is deletions + a toggle).

## Files touched (summary)

- **Delete:** `apps/web/app/about/page.tsx`, `apps/web/components/RagPanel.tsx`
- **Modify:** `apps/web/components/ShowcaseHeader.tsx`, `apps/web/app/page.tsx`, `apps/web/app/wizard/page.tsx`, `apps/web/app/wizard/result/page.tsx`

## Future

None required. This is a focused trim.
