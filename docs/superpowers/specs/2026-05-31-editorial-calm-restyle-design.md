# Editorial Calm Restyle — Design Spec

**Date:** 2026-05-31
**Status:** Approved (brainstorming)
**Topic:** Restyle the Composed web app in a warm, editorial design language inspired by Wispr Flow.

---

## Goal

Give Composed a premium, calm, editorial look — adapting Wispr Flow's *design language* (not a pixel clone) — by restyling every current page and component. **Phase 1 is a pure restyle:** same layouts, same flows, same logic, new skin. The app-shell/sidebar redesign is **Phase 2**, documented here but not built now.

## Design direction (decided)

- **Restyle now, app-shell later.** Keep today's single-page flows; re-skin them. Sidebar + dashboard come in Phase 2.
- **Foundation: "Editorial Calm"** — the most Wispr-faithful of three options the user reviewed and selected (serif headlines + sage accent on a cream canvas).

## Design tokens

Centralized in `tailwind.config.ts` (theme.extend) and `app/globals.css`. No magic values in components — everything references a token.

**Type** (loaded via `next/font/google` in `app/layout.tsx`, exposed as CSS variables):
- **Serif — Newsreader:** display use only — H1/H2 page headings, hero headlines, big stat numbers. Weights 400/500/600.
- **Sans — Inter:** everything else — body, UI, labels, buttons, inputs. Weights 400/450/500/600.
- Tailwind: `fontFamily.serif = ['var(--font-newsreader)', 'Georgia', 'serif']`, `fontFamily.sans = ['var(--font-inter)', 'system-ui', 'sans-serif']`. `sans` is the default body font.

**Color** (Tailwind `colors`, semantic names):
| Token | Hex | Use |
|---|---|---|
| `canvas` | `#F6F2EA` | page background (warm cream) |
| `surface` | `#FFFFFF` | cards |
| `surface-alt` | `#FCFBF7` | secondary cards (e.g. Sharpen panel) |
| `ink` | `#26261F` | primary text / headings |
| `muted` | `#8A857B` | secondary text, labels |
| `hairline` | `#E7E1D6` | borders/dividers |
| `accent` | `#586249` | primary buttons, links, active states (sage-olive) |
| `accent-hover` | `#4A5340` | hover/pressed |
| `accent-tint` | `#EEF0E7` | accent backgrounds/badges |

Light/cream only — **no dark mode** (YAGNI).

**Shape & depth:**
- `borderRadius`: `card` = 16px, `control` = 12px (inputs/buttons), `pill` = 9999px.
- `boxShadow.soft` = `0 1px 2px rgba(0,0,0,.04), 0 12px 30px rgba(0,0,0,.05)` (low-alpha, calm).
- Borders are hairline (`1px solid hairline`), not heavy.
- Content column ~760px, centered, generous whitespace.

**Components language** (applied consistently):
- **Buttons:** primary = solid `accent` pill; secondary = `ghost` (white, hairline border, ink text); both `radius-control`/`pill`. Replaces all current indigo buttons.
- **Cards:** white, `radius-card`, hairline border, `shadow-soft`.
- **Inputs:** white, hairline border, `radius-control`, sage focus ring.
- **Labels:** small uppercase Inter, `muted`, letter-spaced (the `.lbl` pattern).
- **Stat blocks** (used in Phase 2, defined now): big Newsreader number + small muted sans label.

## Scope — Phase 1 (this spec)

Restyle, reusing existing structure/flows/logic. Real files:

**Global:**
- `app/layout.tsx` — add Newsreader + Inter via `next/font/google`; set `canvas` background + base `ink`/`sans` on `<body>`.
- `app/globals.css` — base canvas, CSS font variables, any base element styles.
- `tailwind.config.ts` — add all tokens above.
- `components/ui/*` — restyle/add shared primitives (Button, Card, Input, Label, Badge) so pages compose them. Follow whatever already exists in `components/ui`; add only what's missing. Keep minimal.

**Pages:**
- `app/page.tsx` — home/landing: serif hero headline, cream canvas, sage CTA, calm cards.
- `app/wizard/page.tsx` + step components (`CoursePicker`, `AboutMeStep`, `MaterialStep`, `AssessmentStep`, `ModePicker`, `ModelPicker`) — restyle inputs, selectors, step nav, buttons.
- `app/wizard/result/page.tsx` — already mocked & approved (serif H1, prompt card + ghost Copy, Sharpen panel, plan row).
- `app/history/page.tsx` — list of past prompts as calm cards / timeline rows.
- `app/account/page.tsx` — settings as "setting rows" (label + description + right-aligned ghost button); includes `CalendarConnect`.
- `app/plan/page.tsx` — study schedule in the new card system.

**Shared components:** `ShowcaseHeader` (the header/wordmark in serif), `PromptOutput`, `SharpenPanel`, `StudySchedule`, `FeedbackForm`, `CalendarConnect`, `CoursePicker`, `ModePicker`, `ModelPicker`, `MaterialStep`, `AssessmentStep`, `AboutMeStep`.

**Auth:** `app/sign-in/**` + `app/sign-up/**` — pass Clerk `appearance` (variables: colorPrimary = accent, fonts, radius) so the Clerk widgets match the cream/sage system.

## Implementation principles

- **Presentational only.** No changes to data flow, state, routes, API calls, or component props/contracts. If a refactor is tempting, it's out of scope.
- **Token-first, then page-by-page.** Land the Tailwind tokens + font wiring + shared `ui` primitives first; then restyle each page/component to consume them. Each page is an independent, reviewable unit.
- **No new dependencies** beyond the two Google fonts (via `next/font`, self-hosted).
- **Follow existing patterns** in `components/ui`; don't restructure the component tree.

## Out of scope (Phase 1)

- Sidebar app-shell, dashboard home, stat blocks, recent-prompts timeline → **Phase 2**.
- Dark mode.
- Copy/content rewrites — except page headings that obviously read better in the serif (light touch).
- Any behavior, routing, or backend change.

## Phase 2 (documented, not built now)

Once the restyle is proven: adopt Wispr's **app-shell** — a left sidebar (Home / History / Study plan / Account) with section labels + line-icon nav + subtle active highlight, and a dashboard **"Welcome back"** home featuring stat blocks (prompts made, day streak, next assessment) and a recent-prompts timeline. The Phase 1 tokens + `ui` primitives are designed to carry straight into Phase 2 unchanged.

## Verification

- `npm run build` (apps/web) compiles; all existing tests stay green (web `vitest`, and shared/api untouched).
- Visual QA via the `/browse` skill on each restyled page (home, wizard, result, history, account, plan) at desktop + mobile widths.
- **Accessibility:** verify text/background contrast meets WCAG AA — ink-on-cream and accent-tint pairings especially; sage accent on white for buttons.
- No console errors; no layout shift from font loading (`next/font` handles this).

## Risks / notes

- **Contrast:** sage `#586249` on cream must clear AA for any text use (it's fine as a button background with light text; verify as a text/link color, darken to `accent-hover` if needed).
- **Mobile:** generous whitespace + 760px column must degrade gracefully to small screens — verify the wizard and result pages especially.
- **Clerk theming:** the `appearance` API covers most of the widget; a few elements may need CSS overrides — acceptable, scoped to the auth pages.
