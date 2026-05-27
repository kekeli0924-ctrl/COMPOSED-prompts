# Pomfret Prompt Generator — Design Spec

**Date:** 2026-05-27
**Status:** Approved for planning
**Audience:** Personal/portfolio project; Pomfret School students

## 1. Problem

Pomfret students using LLMs to study typically paste an assignment and write "help me review this." They get generic, low-effort responses. A small amount of upfront prompt engineering — informed by the course, the assessment type, the time available, and the student's actual confusion — would produce much better study sessions.

The solution: a guided web wizard that takes a few minutes of student input and produces a high-quality, LLM-and-model-tuned prompt the student can paste into ChatGPT, Claude, or Gemini.

## 2. Goals

- Generate prompts that are visibly better than what students would write themselves
- Be Pomfret-specialized via course catalog awareness (not generic)
- Tune output to the specific (LLM, model) the student is using
- Support five study modes: cram review, multi-day plan, practice questions, concept clarification, essay/project prep
- Ship a v1 fast — Next.js + Vercel + Anthropic Haiku as the internal LLM
- Keep operational cost under ~$5/month with sane rate limits

## 3. Non-Goals (v1)

- User accounts, SSO, cross-device history sync
- File upload for assignment material (paste only)
- Teacher-style profiles (privacy concerns)
- "Open in ChatGPT/Claude" deep-link buttons
- Automated curriculum PDF parsing (hand-curated JSON)
- Spaced repetition scheduling, calendar/LMS integration
- Multi-language support
- Prompt sharing between students

## 4. The Pomfret-Study Framework

The generated prompt has **7 sections**, in order:

1. **Role** — Tutor persona calibrated to course + student's confidence
2. **About Me** — Course, level (AP/Honors/Regular), department, self-rated confidence (1–5), what I understand, what confuses me
3. **Material** — Pasted assignment details, topics list, source materials
4. **Goal & Constraints** — Assessment type, date, time available, study mode
5. **Interaction Style** — *Generated, not asked.* Derived from mode + confidence + time. Example: "Cram + low confidence → start with quick-fire questions on fundamentals, brief corrections, re-test rather than lecture." Includes a short "Anticipated Misconceptions" hint when the LLM-assisted call is used (see §7.3).
6. **Output Spec** — Exact deliverable shape (e.g., "10 questions: 6 MC + 4 short answer, with answers in a separate section so I can self-test first")
7. **Self-Check & Iteration** — Quality gates and a closing "did this hit what you needed?" loop

Section bodies are filled by the deterministic template assembler, except Section 5 (Interaction Style, including the misconceptions hint), which is produced by the internal Claude Haiku call.

## 5. LLM/Model Tuning

A `data/model-profiles.json` table maps each (LLM, model) pair to:

- **Format**: `xml` | `markdown` | `numbered-steps`
- **Reasoning model**: boolean (if true, drop hand-holding/think-step-by-step language — already built in)
- **Long context**: boolean (if true, allow more material in section 3 before warning)
- **Tool use ready**: boolean (future use)

The generator picks the matching template variant for the chosen (LLM, model). Defaults exist for "any major LLM" if the student doesn't know.

Initial coverage:
- Anthropic: Claude Opus 4.7, Sonnet 4.6, Haiku 4.5
- OpenAI: GPT-5, GPT-4.1, o3, o1
- Google: Gemini 2.5 Pro, Gemini 2.5 Flash

## 6. Wizard UX

Six-step state-machine wizard, single screen per step, progress bar.

| Step | Field | Required | Notes |
|------|-------|----------|-------|
| 1    | LLM + Model | yes | Two-stage: pick LLM, model dropdown filters accordingly |
| 2    | Class | yes | Typeahead over `courses.json`; "Other" allows free text |
| 3    | Study mode | yes | 5 radio options with one-line descriptions |
| 4    | Assessment type, date, time available | yes | Type is a dropdown (test, quiz, paper, project, presentation, other); date picker; hours dropdown (0.5h to 14+ days) |
| 5    | Material (paste) | optional | Single textarea capped at 20,000 characters; soft warning at 15,000; counter visible |
| 6    | Confidence (1–5), what I understand, what confuses me | optional | Slider + two textareas (each capped 2,000 chars) |

Step 5 and 6 are skippable but improve quality.

## 7. Architecture

### 7.1 Pages

- `/` — landing, "Start studying" CTA, short explainer
- `/wizard` — 6-step wizard (client component, single page, state machine)
- `/wizard/result` — generated prompt display, copy button, save-to-history, immediate rating prompt
- `/history` — list of saved past prompts (read-only, localStorage), each accepts a 1–5 rating

### 7.2 API routes (Next.js App Router route handlers)

- `POST /api/generate` — validates inputs with Zod, runs the generation pipeline, returns `{ prompt: string, metadata: {...} }`
- `POST /api/feedback` — stores anonymous `{ promptHash, llm, model, mode, course, rating, text? }` in Vercel KV

### 7.3 Generation pipeline (inside `/api/generate`)

```
Validated input
    ↓
Deterministic template assembler   ← reads templates/, courses.json, model-profiles.json
    ↓
Anthropic Haiku call               ← generates "Interaction Style" + "Anticipated Misconceptions"
    ↓                                (system prompt is static and prompt-cached)
Final prompt (formatted per model profile: xml / markdown / numbered-steps)
    ↓
Return JSON { prompt, metadata }
```

If the Haiku call fails or the daily Anthropic budget cap is hit, the pipeline falls back to a deterministic-only assembly and the result page shows a banner: "Smart sections unavailable, used defaults."

### 7.4 Data files (committed to repo)

- `data/courses.json` — Pomfret course catalog: `{ name, department, level, description, keyTopics }[]`
- `data/model-profiles.json` — per-(LLM, model) format + capability flags
- `data/templates/<mode>.ts` — TS modules exporting deterministic template fragments per study mode

### 7.5 Storage

- **localStorage** — per-user prompt history under key `pomfret.v1.history`. Entries: `{ id, createdAt, inputs (sans material), promptText, llm, model, mode, rating?, ratingText? }`. LRU cap of 50.
- **Vercel KV** — rate-limit sliding-window counters per IP; anonymous feedback aggregates per `promptHash` (`{ count, sum, recentTexts: last 10 }`).

### 7.6 File/folder layout

```
app/
  page.tsx
  wizard/page.tsx
  wizard/result/page.tsx
  history/page.tsx
  api/generate/route.ts
  api/feedback/route.ts
lib/
  templates/                # one .ts module per study mode
  generation/               # assembler + LLM call + model profile selector
  validation/               # Zod schemas
  rate-limit/               # KV-backed sliding window
  storage/                  # localStorage adapter (schema-versioned)
data/
  courses.json
  model-profiles.json
tests/
  unit/
  integration/
  e2e/
```

Each `lib/` module is single-purpose; consumers depend on its exported interface only.

## 8. Privacy

- Pasted material is sent to `/api/generate`, used in the Haiku call, and **not persisted** anywhere (no database writes, no logs). Any error logs that capture request bodies redact the material field to `"[material redacted]"`.
- Local history stores wizard inputs but **not** the pasted material — protects students who share devices.
- Feedback stored against `SHA-256(promptText)`, never against student identifier (there is no identifier).

## 9. Rate Limiting + Budget

- **Per IP:** 20 generations per rolling 24h window (Vercel KV sliding window)
- **Global daily budget (safety ceiling):** soft cap on Anthropic spend at $1.00/day. When crossed, all subsequent requests degrade to deterministic-only assembly. Cap resets daily. This is a safety ceiling, **not** the expected spend — at portfolio scale (a handful of users) expected spend is pennies/day.
- Limits are configurable env vars; v1 starts strict and loosens as needed.

## 10. Error Handling

| Failure | Behavior |
|---------|----------|
| Anthropic API failure / timeout | Fall back to deterministic-only; show banner on result page |
| KV failure on rate-limit lookup | Fail open (allow request), log to Vercel |
| KV failure on feedback write | Toast "couldn't save feedback, try again" |
| Zod validation failure | Inline form errors, no API call |
| No localStorage (private browsing) | History page shows banner; generation works fine |
| Course not in catalog | "Other" path lets student free-text the class; prompt still generates without curriculum injection |

## 11. Testing Strategy

- **Unit (Vitest):** template assembler given inputs X produces expected skeleton; model profile selector picks correct format per (LLM, model); course lookup handles missing/typo courses gracefully
- **Integration (Vitest + msw):** `/api/generate` end-to-end with mocked Anthropic; rate-limit at 21st request; budget cap fallback path
- **E2E (Playwright, 1–2 critical paths only):** full wizard → result → copy → save to history → return → rate
- **Skip:** snapshot tests of generated prompts (brittle as templates evolve); use shape assertions on section presence and substring presence instead

## 12. Tech Stack

- Next.js 14 App Router
- TypeScript strict
- Tailwind CSS + shadcn/ui (Radix accessible primitives)
- Zod for validation
- `@anthropic-ai/sdk` with prompt caching enabled for the static system prompt
- Vercel KV (Upstash Redis)
- Vitest + Playwright for tests

## 13. Operational Cost Estimate

- Hosting: Vercel hobby tier — $0
- Vercel KV: hobby tier — free under low usage
- Anthropic Haiku 4.5: ~$1 per 1M input tokens, ~$5 per 1M output tokens (approximate — confirm at implementation time)
  - Per generation: ~2k input tokens (system + wizard inputs), ~800 output tokens → ~$0.006/generation
  - Expected portfolio-scale usage (≤10 daily users averaging 2 prompts each): ~20 gens/day → ~$0.12/day → ~$3.60/month
  - Safety ceiling: $1/day = $30/month maximum before fallback kicks in

## 14. Open Questions for Implementation Phase

- Exact wording / number of items in each `data/templates/<mode>.ts` skeleton — best done iteratively against real test outputs
- Initial `model-profiles.json` entries — needs source confirmation per model
- Final visual design / shadcn theme — out of scope here; address in implementation
- Curriculum guide parsing — manual for v1; consider semi-automated extraction in a follow-up
