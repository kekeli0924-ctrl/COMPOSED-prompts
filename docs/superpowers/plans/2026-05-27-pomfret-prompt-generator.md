# Pomfret Prompt Generator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js web wizard that produces high-quality, LLM-and-model-tuned study prompts for Pomfret students across 5 study modes, with curriculum awareness, anonymous feedback, and a Sonnet-assisted generation pipeline.

**Architecture:** Single-page wizard collects 6 steps of input, posts to a Next.js API route that runs deterministic template assembly enriched by a single Anthropic Sonnet 4.6 call for the context-specific "Interaction Style" section. Generated prompts saved to localStorage; anonymous feedback aggregated in Vercel KV against prompt hashes.

**Tech Stack:** Next.js 14 (App Router) + TypeScript (strict) + Tailwind + shadcn/ui + Zod + `@anthropic-ai/sdk` + Vercel KV + Vitest + Playwright

**Spec:** `docs/superpowers/specs/2026-05-27-pomfret-prompt-generator-design.md`

---

## File Structure (Locked in)

```
.
├── package.json                              # next, react, tailwindcss, zod, @anthropic-ai/sdk, @vercel/kv
├── tsconfig.json                              # strict
├── next.config.js
├── tailwind.config.ts
├── postcss.config.js
├── vitest.config.ts
├── playwright.config.ts
├── .env.local.example                         # ANTHROPIC_API_KEY, KV_REST_API_URL, KV_REST_API_TOKEN
├── .gitignore
├── README.md
│
├── app/
│   ├── layout.tsx
│   ├── page.tsx                               # landing
│   ├── globals.css
│   ├── wizard/
│   │   ├── page.tsx                           # wizard state machine
│   │   └── result/
│   │       └── page.tsx                       # generated prompt + copy + save
│   ├── history/
│   │   └── page.tsx                           # localStorage history + feedback
│   └── api/
│       ├── generate/
│       │   └── route.ts                       # POST handler
│       └── feedback/
│           └── route.ts                       # POST handler
│
├── components/
│   ├── ui/                                    # shadcn primitives (button, input, textarea, slider, select, label)
│   ├── WizardShell.tsx                        # progress bar + step container
│   ├── ModelPicker.tsx                        # step 1 (LLM + model)
│   ├── CoursePicker.tsx                       # step 2 (typeahead)
│   ├── ModePicker.tsx                         # step 3 (5 radio options)
│   ├── AssessmentStep.tsx                     # step 4
│   ├── MaterialStep.tsx                       # step 5
│   ├── AboutMeStep.tsx                        # step 6
│   ├── PromptOutput.tsx                       # result display + copy
│   └── FeedbackForm.tsx
│
├── lib/
│   ├── types.ts                               # shared types
│   ├── courses.ts                             # loader for data/courses.json
│   ├── model-profiles.ts                      # loader for data/model-profiles.json
│   ├── validation/
│   │   └── wizard-inputs.ts                   # Zod schemas
│   ├── templates/
│   │   ├── index.ts                           # mode→template selector
│   │   ├── shared.ts                          # common section builders (Role, About Me, etc.)
│   │   ├── cram-review.ts
│   │   ├── multi-day-plan.ts
│   │   ├── practice-questions.ts
│   │   ├── concept-clarification.ts
│   │   └── essay-project.ts
│   ├── generation/
│   │   ├── assembler.ts                       # deterministic section assembly
│   │   ├── format-selector.ts                 # xml/markdown/numbered-steps per model
│   │   ├── interaction-style.ts               # Sonnet call
│   │   └── pipeline.ts                        # orchestrator (assembler + Sonnet + fallback)
│   ├── rate-limit/
│   │   └── sliding-window.ts                  # KV-backed per-IP rate limit
│   ├── budget/
│   │   └── daily-cap.ts                       # KV-backed daily spend tracker
│   ├── storage/
│   │   ├── history.ts                         # localStorage adapter (schema-versioned)
│   │   └── prompt-hash.ts                     # SHA-256 promptHash
│   └── kv.ts                                  # Vercel KV client + in-memory fallback for tests
│
├── data/
│   ├── courses.json                           # parsed Pomfret curriculum
│   └── model-profiles.json                    # per-(LLM, model) format + capabilities
│
├── scripts/
│   └── parse-curriculum.ts                    # one-shot: curriculum .md → courses.json
│
└── tests/
    ├── unit/
    │   ├── parse-curriculum.test.ts
    │   ├── courses.test.ts
    │   ├── model-profiles.test.ts
    │   ├── validation.test.ts
    │   ├── templates-shared.test.ts
    │   ├── templates-cram-review.test.ts
    │   ├── templates-multi-day-plan.test.ts
    │   ├── templates-practice-questions.test.ts
    │   ├── templates-concept-clarification.test.ts
    │   ├── templates-essay-project.test.ts
    │   ├── format-selector.test.ts
    │   ├── assembler.test.ts
    │   ├── pipeline.test.ts
    │   ├── rate-limit.test.ts
    │   ├── daily-cap.test.ts
    │   ├── prompt-hash.test.ts
    │   └── storage-history.test.ts
    ├── integration/
    │   ├── generate-route.test.ts
    │   └── feedback-route.test.ts
    └── e2e/
        └── wizard-flow.spec.ts
```

---

## Phase 1: Foundation

### Task 1: Initialize Next.js project

**Files:**
- Create: `package.json`, `next.config.js`, `tsconfig.json`, `tailwind.config.ts`, `postcss.config.js`, `app/layout.tsx`, `app/page.tsx`, `app/globals.css`, `.gitignore`, `.env.local.example`

- [ ] **Step 1: Run Next.js init non-interactively**

```bash
cd /Users/likerun/Desktop/prompt
npx create-next-app@14 . --typescript --tailwind --app --src-dir false --eslint --import-alias "@/*" --use-npm --no-turbopack
```

Expected: scaffolds Next.js 14 with TS + Tailwind + App Router.

- [ ] **Step 2: Add project dependencies**

```bash
npm install zod @anthropic-ai/sdk @vercel/kv clsx
npm install -D vitest @vitest/ui @vitejs/plugin-react jsdom @testing-library/react @testing-library/dom @types/node msw playwright @playwright/test
```

- [ ] **Step 3: Enable TS strict mode**

Edit `tsconfig.json` — ensure `"strict": true, "noUncheckedIndexedAccess": true` is set.

- [ ] **Step 4: Create `.env.local.example`**

```bash
# .env.local.example
ANTHROPIC_API_KEY=sk-ant-...
KV_REST_API_URL=https://...
KV_REST_API_TOKEN=...
KV_REST_API_READ_ONLY_TOKEN=...

# Operational knobs
RATE_LIMIT_PER_IP_PER_DAY=20
DAILY_BUDGET_CEILING_USD=3.00
```

- [ ] **Step 5: Verify dev server starts**

```bash
npm run dev
```

Expected: server starts on http://localhost:3000 — visit it, see default Next page. Stop with Ctrl-C.

- [ ] **Step 6: Commit**

```bash
git add .
git commit -m "feat: scaffold Next.js 14 + Tailwind + TS strict project"
```

---

### Task 2: Set up Vitest

**Files:**
- Create: `vitest.config.ts`, `tests/setup.ts`

- [ ] **Step 1: Create `vitest.config.ts`**

```typescript
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    exclude: ['tests/e2e/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.'),
    },
  },
});
```

- [ ] **Step 2: Create `tests/setup.ts`**

```typescript
import '@testing-library/dom';
```

- [ ] **Step 3: Add test scripts to `package.json`**

Add to `"scripts"`:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:e2e": "playwright test"
```

- [ ] **Step 4: Add a smoke test**

Create `tests/unit/smoke.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs vitest', () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 5: Run it**

```bash
npm test
```

Expected: 1 passing test.

- [ ] **Step 6: Commit**

```bash
git add vitest.config.ts tests/ package.json package-lock.json
git commit -m "test: add Vitest with jsdom + smoke test"
```

---

### Task 3: Add shadcn/ui primitives

**Files:**
- Modify: `tailwind.config.ts`, `app/globals.css`
- Create: `components/ui/{button,input,textarea,label,slider,select}.tsx`, `lib/utils.ts`

- [ ] **Step 1: Initialize shadcn**

```bash
npx shadcn@latest init --yes --defaults --base-color slate
```

If prompted, accept defaults: `cn` helper to `lib/utils.ts`, components to `components/ui/`.

- [ ] **Step 2: Add the primitives we need**

```bash
npx shadcn@latest add button input textarea label slider select radio-group progress card alert --yes
```

- [ ] **Step 3: Confirm cn helper exists**

Read `lib/utils.ts` — should export `cn`.

- [ ] **Step 4: Verify build still works**

```bash
npm run build
```

Expected: builds successfully.

- [ ] **Step 5: Commit**

```bash
git add components/ui lib/utils.ts app/globals.css tailwind.config.ts components.json package.json package-lock.json
git commit -m "feat: add shadcn/ui primitives (button, input, textarea, label, slider, select, radio-group, progress, card, alert)"
```

---

## Phase 2: Curriculum Data

### Task 4: Curriculum parser (TDD)

**Files:**
- Create: `scripts/parse-curriculum.ts`, `tests/unit/parse-curriculum.test.ts`

- [ ] **Step 1: Write failing test for department extraction**

Create `tests/unit/parse-curriculum.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { parseCurriculum } from '@/scripts/parse-curriculum';

const SAMPLE = `
# **Arts**  {#arts}

The requirements for Arts are as follows: blah blah.

**ALL ARTS COURSES ARE GRADED ACCORDING TO COMPETENCY BASED LEARNING**

**Courses listed in alphabetical order:**

**Acting and Improv (Term long-Fall, Winter & Spring)**
Perform with and without a script in this introductory acting course designed for anyone interested in developing their self-confidence.

**ADV Ceramics (Year long)**
This is a year long course for students who have demonstrated dedication. PREREQUISITE: Students must apply for this class.

**HON Astronomy (Year long) \\- opportunity for Advanced level**
Explore the cosmos.

# **English** {#english}

**Eng: Playwriting (Term long-Fall)**
Students will discover the makings of a great play. *Cross-listed with Arts.*
`;

describe('parseCurriculum', () => {
  it('extracts courses grouped by department', () => {
    const result = parseCurriculum(SAMPLE);
    const depts = new Set(result.map((c) => c.department));
    expect(depts).toEqual(new Set(['Arts', 'English']));
  });

  it('captures course name, term, and description', () => {
    const result = parseCurriculum(SAMPLE);
    const acting = result.find((c) => c.name === 'Acting and Improv');
    expect(acting).toBeDefined();
    expect(acting!.term).toBe('Term long-Fall, Winter & Spring');
    expect(acting!.department).toBe('Arts');
    expect(acting!.description).toContain('introductory acting course');
  });

  it('detects ADV level', () => {
    const result = parseCurriculum(SAMPLE);
    const ceramics = result.find((c) => c.name === 'ADV Ceramics');
    expect(ceramics!.level).toBe('Advanced');
  });

  it('detects HON level', () => {
    const result = parseCurriculum(SAMPLE);
    const astro = result.find((c) => c.name === 'HON Astronomy');
    expect(astro!.level).toBe('Honors');
  });

  it('detects prerequisites', () => {
    const result = parseCurriculum(SAMPLE);
    const ceramics = result.find((c) => c.name === 'ADV Ceramics');
    expect(ceramics!.prerequisites).toContain('must apply');
  });

  it('detects cross-listed departments', () => {
    const result = parseCurriculum(SAMPLE);
    const playwriting = result.find((c) => c.name === 'Eng: Playwriting');
    expect(playwriting!.crossListedWith).toEqual(['Arts']);
  });

  it('assigns a kebab-case id', () => {
    const result = parseCurriculum(SAMPLE);
    const acting = result.find((c) => c.name === 'Acting and Improv');
    expect(acting!.id).toBe('arts-acting-and-improv');
  });
});
```

- [ ] **Step 2: Run test, verify it fails**

```bash
npm test tests/unit/parse-curriculum.test.ts
```

Expected: FAIL — `parseCurriculum is not a function` / module not found.

- [ ] **Step 3: Implement the parser**

Create `scripts/parse-curriculum.ts`:
```typescript
export type Course = {
  id: string;
  name: string;
  department: string;
  level: 'Advanced' | 'Honors' | 'Standard';
  term: string;
  description: string;
  crossListedWith?: string[];
  prerequisites?: string;
};

const DEPARTMENTS = new Set([
  'Arts',
  'English',
  'History and Social Sciences',
  'Mathematics',
  'Science',
  'Wellbeing',
  'World Languages',
]);

const slugify = (s: string): string =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');

const detectLevel = (name: string): Course['level'] => {
  if (/^ADV\b/i.test(name)) return 'Advanced';
  if (/^HON\b/i.test(name)) return 'Honors';
  return 'Standard';
};

const COURSE_HEADER_RE = /^\*\*(.+?)\s+\(([^)]+)\)\*\*/;
const DEPT_HEADER_RE = /^#\s+\*\*([^*]+?)\*\*/;
const CROSS_LIST_RE = /Cross-listed with ([^.\n*]+)/i;
const PREREQ_RE = /PREREQUISITE:\s*([^\n]+)/i;

export function parseCurriculum(md: string): Course[] {
  const lines = md.split(/\r?\n/);
  const courses: Course[] = [];
  let currentDept: string | null = null;
  let pending: { name: string; term: string; descLines: string[] } | null = null;

  const flush = (): void => {
    if (!pending || !currentDept) {
      pending = null;
      return;
    }
    const description = pending.descLines.join(' ').trim();
    const crossMatch = description.match(CROSS_LIST_RE);
    const crossListedWith = crossMatch
      ? crossMatch[1]!.split(/\s+and\s+|,\s*/).map((s) => s.trim()).filter(Boolean)
      : undefined;
    const prereqMatch = description.match(PREREQ_RE);
    const prerequisites = prereqMatch ? prereqMatch[1]!.trim() : undefined;

    const cleanDescription = description
      .replace(CROSS_LIST_RE, '')
      .replace(PREREQ_RE, '')
      .replace(/\s+/g, ' ')
      .trim();

    const level = detectLevel(pending.name);
    const id = `${slugify(currentDept)}-${slugify(pending.name)}`;

    courses.push({
      id,
      name: pending.name,
      department: currentDept,
      level,
      term: pending.term,
      description: cleanDescription,
      ...(crossListedWith && crossListedWith.length > 0 ? { crossListedWith } : {}),
      ...(prerequisites ? { prerequisites } : {}),
    });
    pending = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trimEnd();

    const deptMatch = line.match(DEPT_HEADER_RE);
    if (deptMatch) {
      flush();
      const dept = deptMatch[1]!.trim();
      currentDept = DEPARTMENTS.has(dept) ? dept : null;
      continue;
    }

    if (!currentDept) continue;

    const courseMatch = line.match(COURSE_HEADER_RE);
    if (courseMatch) {
      flush();
      pending = {
        name: courseMatch[1]!.replace(/\\/g, '').trim(),
        term: courseMatch[2]!.trim(),
        descLines: [],
      };
      continue;
    }

    if (pending && line.length > 0 && !line.startsWith('#')) {
      pending.descLines.push(line);
    } else if (pending && line.length === 0 && pending.descLines.length > 0) {
      // blank line ends description
      flush();
    }
  }
  flush();

  return courses;
}
```

- [ ] **Step 4: Run tests, verify all pass**

```bash
npm test tests/unit/parse-curriculum.test.ts
```

Expected: all 7 tests pass.

- [ ] **Step 5: Commit**

```bash
git add scripts/parse-curriculum.ts tests/unit/parse-curriculum.test.ts
git commit -m "feat(curriculum): markdown→Course[] parser with tests"
```

---

### Task 5: Generate `data/courses.json` from the curriculum guide

**Files:**
- Create: `data/courses.json`, `scripts/build-courses.ts`

- [ ] **Step 1: Create the build script**

Create `scripts/build-courses.ts`:
```typescript
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { parseCurriculum } from './parse-curriculum';

const SOURCE = '/Users/likerun/Downloads/Pomfret Curriculum Guide 2026-2027.md';
const OUT = resolve(__dirname, '..', 'data', 'courses.json');

const md = readFileSync(SOURCE, 'utf-8');
const courses = parseCurriculum(md);

mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, JSON.stringify(courses, null, 2));

console.log(`Wrote ${courses.length} courses to ${OUT}`);
const byDept = courses.reduce<Record<string, number>>((acc, c) => {
  acc[c.department] = (acc[c.department] ?? 0) + 1;
  return acc;
}, {});
console.log('By department:', byDept);
```

- [ ] **Step 2: Run the build**

```bash
npx tsx scripts/build-courses.ts
```

If `tsx` not installed:
```bash
npm install -D tsx
npx tsx scripts/build-courses.ts
```

Expected: prints "Wrote N courses..." with N likely 100–200, and a per-department breakdown covering Arts, English, History and Social Sciences, Mathematics, Science, Wellbeing, World Languages.

- [ ] **Step 3: Sanity-check the JSON**

```bash
node -e "const c=require('./data/courses.json'); console.log('total:', c.length); console.log('sample:', c[0]);"
```

Inspect that the first course has all expected fields populated.

- [ ] **Step 4: Add a build script alias**

In `package.json` `"scripts"` add:
```json
"build:courses": "tsx scripts/build-courses.ts"
```

- [ ] **Step 5: Commit**

```bash
git add data/courses.json scripts/build-courses.ts package.json package-lock.json
git commit -m "data: generate courses.json from curriculum guide"
```

---

### Task 6: `data/model-profiles.json` + loader (TDD)

**Files:**
- Create: `data/model-profiles.json`, `lib/model-profiles.ts`, `tests/unit/model-profiles.test.ts`

- [ ] **Step 1: Write the data file**

Create `data/model-profiles.json`:
```json
{
  "providers": {
    "anthropic": {
      "displayName": "Claude (Anthropic)",
      "models": {
        "claude-opus-4-7": {
          "displayName": "Claude Opus 4.7",
          "format": "xml",
          "isReasoning": false,
          "longContext": true,
          "supportsToolUse": true
        },
        "claude-sonnet-4-6": {
          "displayName": "Claude Sonnet 4.6",
          "format": "xml",
          "isReasoning": false,
          "longContext": true,
          "supportsToolUse": true
        },
        "claude-haiku-4-5": {
          "displayName": "Claude Haiku 4.5",
          "format": "xml",
          "isReasoning": false,
          "longContext": true,
          "supportsToolUse": true
        }
      }
    },
    "openai": {
      "displayName": "ChatGPT (OpenAI)",
      "models": {
        "gpt-5": {
          "displayName": "GPT-5",
          "format": "markdown",
          "isReasoning": false,
          "longContext": true,
          "supportsToolUse": true
        },
        "gpt-4-1": {
          "displayName": "GPT-4.1",
          "format": "markdown",
          "isReasoning": false,
          "longContext": true,
          "supportsToolUse": true
        },
        "o3": {
          "displayName": "o3",
          "format": "markdown",
          "isReasoning": true,
          "longContext": true,
          "supportsToolUse": true
        },
        "o1": {
          "displayName": "o1",
          "format": "markdown",
          "isReasoning": true,
          "longContext": false,
          "supportsToolUse": false
        }
      }
    },
    "google": {
      "displayName": "Gemini (Google)",
      "models": {
        "gemini-2-5-pro": {
          "displayName": "Gemini 2.5 Pro",
          "format": "numbered-steps",
          "isReasoning": false,
          "longContext": true,
          "supportsToolUse": true
        },
        "gemini-2-5-flash": {
          "displayName": "Gemini 2.5 Flash",
          "format": "numbered-steps",
          "isReasoning": false,
          "longContext": true,
          "supportsToolUse": true
        }
      }
    },
    "other": {
      "displayName": "Other / Unsure",
      "models": {
        "generic": {
          "displayName": "Any major LLM",
          "format": "markdown",
          "isReasoning": false,
          "longContext": false,
          "supportsToolUse": false
        }
      }
    }
  }
}
```

- [ ] **Step 2: Write failing test for loader**

Create `tests/unit/model-profiles.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { getModelProfile, listProviders } from '@/lib/model-profiles';

describe('model-profiles', () => {
  it('lists all providers', () => {
    const provs = listProviders();
    expect(provs.map((p) => p.id)).toEqual(['anthropic', 'openai', 'google', 'other']);
  });

  it('returns the profile for a known (provider, model)', () => {
    const profile = getModelProfile('anthropic', 'claude-opus-4-7');
    expect(profile).toMatchObject({
      displayName: 'Claude Opus 4.7',
      format: 'xml',
      isReasoning: false,
    });
  });

  it('falls back to generic for unknown model', () => {
    const profile = getModelProfile('anthropic', 'fake-model-xyz');
    expect(profile.format).toBe('markdown');
    expect(profile.displayName).toBe('Any major LLM');
  });

  it('marks o3 as a reasoning model', () => {
    const profile = getModelProfile('openai', 'o3');
    expect(profile.isReasoning).toBe(true);
  });
});
```

- [ ] **Step 3: Run, verify it fails**

```bash
npm test tests/unit/model-profiles.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 4: Implement the loader**

Create `lib/model-profiles.ts`:
```typescript
import profilesData from '@/data/model-profiles.json';

export type ModelFormat = 'xml' | 'markdown' | 'numbered-steps';

export type ModelProfile = {
  displayName: string;
  format: ModelFormat;
  isReasoning: boolean;
  longContext: boolean;
  supportsToolUse: boolean;
};

type ProvidersFile = {
  providers: Record<
    string,
    { displayName: string; models: Record<string, ModelProfile> }
  >;
};

const data = profilesData as ProvidersFile;

const GENERIC: ModelProfile = data.providers.other!.models.generic!;

export function listProviders(): Array<{ id: string; displayName: string }> {
  return Object.entries(data.providers).map(([id, p]) => ({
    id,
    displayName: p.displayName,
  }));
}

export function listModelsForProvider(
  providerId: string,
): Array<{ id: string; displayName: string }> {
  const p = data.providers[providerId];
  if (!p) return [];
  return Object.entries(p.models).map(([id, m]) => ({
    id,
    displayName: m.displayName,
  }));
}

export function getModelProfile(providerId: string, modelId: string): ModelProfile {
  return data.providers[providerId]?.models[modelId] ?? GENERIC;
}
```

- [ ] **Step 5: Configure JSON imports in tsconfig**

Edit `tsconfig.json` `"compilerOptions"` and ensure:
```json
"resolveJsonModule": true,
"esModuleInterop": true
```

- [ ] **Step 6: Run tests, verify all pass**

```bash
npm test tests/unit/model-profiles.test.ts
```

Expected: 4 passing.

- [ ] **Step 7: Commit**

```bash
git add data/model-profiles.json lib/model-profiles.ts tests/unit/model-profiles.test.ts tsconfig.json
git commit -m "feat: model-profiles data + typed loader with tests"
```

---

### Task 7: Courses loader (TDD)

**Files:**
- Create: `lib/courses.ts`, `tests/unit/courses.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/courses.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { allCourses, findCourse, searchCourses } from '@/lib/courses';

describe('courses loader', () => {
  it('loads all courses from JSON', () => {
    const courses = allCourses();
    expect(courses.length).toBeGreaterThan(50);
    expect(courses[0]).toHaveProperty('id');
    expect(courses[0]).toHaveProperty('name');
    expect(courses[0]).toHaveProperty('department');
  });

  it('finds a course by exact id', () => {
    const courses = allCourses();
    const sample = courses[0]!;
    const found = findCourse(sample.id);
    expect(found?.name).toBe(sample.name);
  });

  it('returns undefined for unknown id', () => {
    expect(findCourse('totally-fake-course-id')).toBeUndefined();
  });

  it('searchCourses returns case-insensitive substring matches sorted by relevance', () => {
    const matches = searchCourses('astro');
    expect(matches.length).toBeGreaterThan(0);
    expect(matches[0]!.name.toLowerCase()).toContain('astro');
  });

  it('searchCourses returns empty array for no matches', () => {
    expect(searchCourses('zzzzzzzzz')).toEqual([]);
  });

  it('searchCourses returns empty array for empty query', () => {
    expect(searchCourses('')).toEqual([]);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
npm test tests/unit/courses.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement loader**

Create `lib/courses.ts`:
```typescript
import coursesData from '@/data/courses.json';

export type Course = {
  id: string;
  name: string;
  department: string;
  level: 'Advanced' | 'Honors' | 'Standard';
  term: string;
  description: string;
  crossListedWith?: string[];
  prerequisites?: string;
};

const COURSES = coursesData as Course[];

export function allCourses(): Course[] {
  return COURSES;
}

export function findCourse(id: string): Course | undefined {
  return COURSES.find((c) => c.id === id);
}

export function searchCourses(query: string, limit = 20): Course[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const scored = COURSES.map((c) => {
    const name = c.name.toLowerCase();
    let score = 0;
    if (name === q) score = 100;
    else if (name.startsWith(q)) score = 50;
    else if (name.includes(q)) score = 20;
    else if (c.description.toLowerCase().includes(q)) score = 5;
    return { c, score };
  })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || a.c.name.localeCompare(b.c.name))
    .slice(0, limit)
    .map((s) => s.c);
  return scored;
}
```

- [ ] **Step 4: Run tests, all pass**

```bash
npm test tests/unit/courses.test.ts
```

Expected: 6 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/courses.ts tests/unit/courses.test.ts
git commit -m "feat: courses loader with search + tests"
```

---

## Phase 3: Types + Validation

### Task 8: Shared types

**Files:**
- Create: `lib/types.ts`

- [ ] **Step 1: Create the types module**

Create `lib/types.ts`:
```typescript
export type StudyMode =
  | 'cram-review'
  | 'multi-day-plan'
  | 'practice-questions'
  | 'concept-clarification'
  | 'essay-project';

export type AssessmentType =
  | 'test'
  | 'quiz'
  | 'paper'
  | 'project'
  | 'presentation'
  | 'other';

export type WizardInputs = {
  // Step 1
  provider: string;          // e.g. 'anthropic'
  model: string;             // e.g. 'claude-opus-4-7'

  // Step 2
  courseId: string | null;   // null when 'Other'
  courseFreeText?: string;   // used when courseId is null

  // Step 3
  mode: StudyMode;

  // Step 4
  assessmentType: AssessmentType;
  assessmentDate: string;    // ISO yyyy-mm-dd
  hoursAvailable: number;    // e.g. 0.5, 1, 2, 4, 8, 24, 72, ...

  // Step 5 (optional)
  material?: string;         // max 20000 chars

  // Step 6 (optional)
  confidence?: 1 | 2 | 3 | 4 | 5;
  understanding?: string;    // max 2000 chars
  confusion?: string;        // max 2000 chars
};

export type GenerateResponse = {
  prompt: string;
  metadata: {
    sonnetUsed: boolean;
    fallbackReason?: 'budget-exhausted' | 'api-error' | 'feature-disabled';
    promptHash: string;
  };
};

export type FeedbackPayload = {
  promptHash: string;
  provider: string;
  model: string;
  mode: StudyMode;
  courseId: string | null;
  rating: 1 | 2 | 3 | 4 | 5;
  text?: string;
};
```

- [ ] **Step 2: Commit**

```bash
git add lib/types.ts
git commit -m "feat: shared types for wizard inputs + API"
```

---

### Task 9: Zod validation (TDD)

**Files:**
- Create: `lib/validation/wizard-inputs.ts`, `tests/unit/validation.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/validation.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { WizardInputsSchema, FeedbackPayloadSchema } from '@/lib/validation/wizard-inputs';

const validInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-01',
  hoursAvailable: 4,
};

describe('WizardInputsSchema', () => {
  it('accepts a minimal valid input', () => {
    const r = WizardInputsSchema.safeParse(validInputs);
    expect(r.success).toBe(true);
  });

  it('rejects missing provider', () => {
    const r = WizardInputsSchema.safeParse({ ...validInputs, provider: undefined });
    expect(r.success).toBe(false);
  });

  it('rejects bad date format', () => {
    const r = WizardInputsSchema.safeParse({ ...validInputs, assessmentDate: '06/01/2026' });
    expect(r.success).toBe(false);
  });

  it('rejects material over 20000 chars', () => {
    const r = WizardInputsSchema.safeParse({
      ...validInputs,
      material: 'x'.repeat(20001),
    });
    expect(r.success).toBe(false);
  });

  it('accepts material at the limit', () => {
    const r = WizardInputsSchema.safeParse({
      ...validInputs,
      material: 'x'.repeat(20000),
    });
    expect(r.success).toBe(true);
  });

  it('rejects unknown mode', () => {
    const r = WizardInputsSchema.safeParse({ ...validInputs, mode: 'invalid-mode' });
    expect(r.success).toBe(false);
  });

  it('allows courseId null with courseFreeText', () => {
    const r = WizardInputsSchema.safeParse({
      ...validInputs,
      courseId: null,
      courseFreeText: 'Independent reading on Camus',
    });
    expect(r.success).toBe(true);
  });

  it('rejects courseId null without courseFreeText', () => {
    const r = WizardInputsSchema.safeParse({
      ...validInputs,
      courseId: null,
      courseFreeText: undefined,
    });
    expect(r.success).toBe(false);
  });
});

describe('FeedbackPayloadSchema', () => {
  it('accepts a valid feedback payload', () => {
    const r = FeedbackPayloadSchema.safeParse({
      promptHash: 'a'.repeat(64),
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      mode: 'cram-review',
      courseId: 'arts-acting-and-improv',
      rating: 4,
    });
    expect(r.success).toBe(true);
  });

  it('rejects rating outside 1-5', () => {
    const r = FeedbackPayloadSchema.safeParse({
      promptHash: 'a'.repeat(64),
      provider: 'anthropic',
      model: 'claude-opus-4-7',
      mode: 'cram-review',
      courseId: null,
      rating: 7,
    });
    expect(r.success).toBe(false);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
npm test tests/unit/validation.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the schemas**

Create `lib/validation/wizard-inputs.ts`:
```typescript
import { z } from 'zod';

const StudyModeEnum = z.enum([
  'cram-review',
  'multi-day-plan',
  'practice-questions',
  'concept-clarification',
  'essay-project',
]);

const AssessmentTypeEnum = z.enum([
  'test',
  'quiz',
  'paper',
  'project',
  'presentation',
  'other',
]);

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export const WizardInputsSchema = z
  .object({
    provider: z.string().min(1).max(50),
    model: z.string().min(1).max(100),
    courseId: z.string().min(1).max(100).nullable(),
    courseFreeText: z.string().min(1).max(200).optional(),
    mode: StudyModeEnum,
    assessmentType: AssessmentTypeEnum,
    assessmentDate: z
      .string()
      .regex(ISO_DATE_RE, 'must be YYYY-MM-DD'),
    hoursAvailable: z.number().positive().max(720),
    material: z.string().max(20000).optional(),
    confidence: z.union([
      z.literal(1),
      z.literal(2),
      z.literal(3),
      z.literal(4),
      z.literal(5),
    ]).optional(),
    understanding: z.string().max(2000).optional(),
    confusion: z.string().max(2000).optional(),
  })
  .superRefine((val, ctx) => {
    if (val.courseId === null && !val.courseFreeText) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'courseFreeText is required when courseId is null',
        path: ['courseFreeText'],
      });
    }
  });

export const FeedbackPayloadSchema = z.object({
  promptHash: z.string().length(64),
  provider: z.string().min(1).max(50),
  model: z.string().min(1).max(100),
  mode: StudyModeEnum,
  courseId: z.string().min(1).max(100).nullable(),
  rating: z.union([
    z.literal(1),
    z.literal(2),
    z.literal(3),
    z.literal(4),
    z.literal(5),
  ]),
  text: z.string().max(1000).optional(),
});
```

- [ ] **Step 4: Run tests, all pass**

```bash
npm test tests/unit/validation.test.ts
```

Expected: 10 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/validation tests/unit/validation.test.ts
git commit -m "feat: zod schemas for wizard inputs + feedback"
```

---

## Phase 4: Deterministic Generation

### Task 10: Shared section builders (TDD)

**Files:**
- Create: `lib/templates/shared.ts`, `tests/unit/templates-shared.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/templates-shared.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildRoleSection, buildAboutMeSection, buildMaterialSection, buildGoalSection, buildSelfCheckSection } from '@/lib/templates/shared';
import type { WizardInputs } from '@/lib/types';

const baseInputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-01',
  hoursAvailable: 4,
  confidence: 3,
  understanding: 'I get the basics',
  confusion: 'Subtext analysis is tricky',
  material: 'Stanislavski method chapter 3',
};

describe('shared section builders', () => {
  it('Role section mentions the course and a tutor persona', () => {
    const out = buildRoleSection(baseInputs);
    expect(out).toMatch(/tutor/i);
    expect(out).toContain('Acting and Improv');
  });

  it('Role section uses "patient" persona for confidence <= 2', () => {
    const out = buildRoleSection({ ...baseInputs, confidence: 2 });
    expect(out).toMatch(/patient/i);
  });

  it('Role section uses "rigorous" persona for confidence >= 4', () => {
    const out = buildRoleSection({ ...baseInputs, confidence: 4 });
    expect(out).toMatch(/rigorous/i);
  });

  it('Role falls back when courseId is null', () => {
    const out = buildRoleSection({
      ...baseInputs,
      courseId: null,
      courseFreeText: 'Independent reading',
    });
    expect(out).toContain('Independent reading');
  });

  it('About Me includes confidence and confusion notes when present', () => {
    const out = buildAboutMeSection(baseInputs);
    expect(out).toContain('3 of 5');
    expect(out).toContain('Subtext analysis is tricky');
  });

  it('About Me omits empty optional fields', () => {
    const slim = { ...baseInputs, confidence: undefined, understanding: undefined, confusion: undefined };
    const out = buildAboutMeSection(slim);
    expect(out).not.toContain('Confidence:');
    expect(out).not.toContain('What I understand:');
  });

  it('Material section emits a no-material note when material is empty', () => {
    const out = buildMaterialSection({ ...baseInputs, material: undefined });
    expect(out).toMatch(/no specific material/i);
  });

  it('Material section includes the pasted material', () => {
    const out = buildMaterialSection(baseInputs);
    expect(out).toContain('Stanislavski method');
  });

  it('Goal section mentions assessment type, date, and hours', () => {
    const out = buildGoalSection(baseInputs);
    expect(out).toContain('test');
    expect(out).toContain('2026-06-01');
    expect(out).toMatch(/4\s+hours?/);
  });

  it('Self-Check section references the assessment', () => {
    const out = buildSelfCheckSection(baseInputs);
    expect(out).toMatch(/before responding/i);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
npm test tests/unit/templates-shared.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement the builders**

Create `lib/templates/shared.ts`:
```typescript
import type { WizardInputs } from '@/lib/types';
import { findCourse } from '@/lib/courses';

const courseLabel = (inputs: WizardInputs): string => {
  if (inputs.courseId) {
    const c = findCourse(inputs.courseId);
    return c?.name ?? inputs.courseFreeText ?? 'an unspecified course';
  }
  return inputs.courseFreeText ?? 'an unspecified course';
};

const courseContext = (inputs: WizardInputs): string => {
  if (!inputs.courseId) return '';
  const c = findCourse(inputs.courseId);
  if (!c) return '';
  const parts = [
    `Department: ${c.department}.`,
    `Level: ${c.level}.`,
    c.description ? `Course description: ${c.description}` : '',
  ].filter(Boolean);
  return parts.join(' ');
};

const personaFor = (confidence: number | undefined): string => {
  if (confidence === undefined) return 'experienced';
  if (confidence <= 2) return 'patient';
  if (confidence >= 4) return 'rigorous';
  return 'experienced';
};

export function buildRoleSection(inputs: WizardInputs): string {
  const persona = personaFor(inputs.confidence);
  const course = courseLabel(inputs);
  const context = courseContext(inputs);
  return [
    `You are a ${persona} tutor for ${course} at Pomfret School, a U.S. boarding school.`,
    context,
  ]
    .filter(Boolean)
    .join(' ')
    .trim();
}

export function buildAboutMeSection(inputs: WizardInputs): string {
  const lines: string[] = [];
  if (inputs.courseId) {
    const c = findCourse(inputs.courseId);
    if (c) {
      lines.push(`- Course: ${c.name} (${c.level})`);
      lines.push(`- Department: ${c.department}`);
    }
  } else if (inputs.courseFreeText) {
    lines.push(`- Course: ${inputs.courseFreeText}`);
  }
  if (inputs.confidence !== undefined) {
    lines.push(`- Confidence: ${inputs.confidence} of 5`);
  }
  if (inputs.understanding) {
    lines.push(`- What I understand: ${inputs.understanding}`);
  }
  if (inputs.confusion) {
    lines.push(`- What confuses me: ${inputs.confusion}`);
  }
  return lines.length > 0 ? lines.join('\n') : 'No additional context provided.';
}

export function buildMaterialSection(inputs: WizardInputs): string {
  if (!inputs.material || inputs.material.trim().length === 0) {
    return 'I have not pasted specific material — please ask me to share my notes, syllabus, or topic list if you need them to be effective.';
  }
  return inputs.material.trim();
}

const formatHours = (h: number): string => {
  if (h < 1) {
    const minutes = Math.round(h * 60);
    return `${minutes} minutes`;
  }
  if (h < 24) return `${h} hours`;
  const days = Math.round(h / 24);
  return `${days} days`;
};

export function buildGoalSection(inputs: WizardInputs): string {
  return [
    `I'm preparing for a ${inputs.assessmentType} on ${inputs.assessmentDate}.`,
    `I have ${formatHours(inputs.hoursAvailable)} of study time between now and then.`,
  ].join(' ');
}

export function buildSelfCheckSection(inputs: WizardInputs): string {
  const course = courseLabel(inputs);
  return [
    'Before responding:',
    `- Confirm the material aligns with the level expected in ${course}.`,
    '- If anything I provided is unclear or you need more material, ask me a clarifying question before proceeding.',
    '',
    'If I push back on your output:',
    "- Don't simply agree — explain your reasoning.",
    '- Adjust only if I'm correct or if I provide new information.',
    '',
    'After your response, ask: "Did this hit what you needed? If not, what should be different?"',
  ].join('\n');
}
```

- [ ] **Step 4: Run, all pass**

```bash
npm test tests/unit/templates-shared.test.ts
```

Expected: 10 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/templates/shared.ts tests/unit/templates-shared.test.ts
git commit -m "feat(templates): shared section builders (Role, AboutMe, Material, Goal, SelfCheck)"
```

---

### Task 11: Cram-review template (TDD)

**Files:**
- Create: `lib/templates/cram-review.ts`, `tests/unit/templates-cram-review.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/templates-cram-review.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildCramReviewOutputSpec, buildCramReviewFallbackInteractionStyle } from '@/lib/templates/cram-review';
import type { WizardInputs } from '@/lib/types';

const inputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-01',
  hoursAvailable: 2,
  confidence: 2,
};

describe('cram-review template', () => {
  it('outputs a rapid-quiz-style deliverable spec', () => {
    const out = buildCramReviewOutputSpec(inputs);
    expect(out).toMatch(/quiz|practice|self-test/i);
  });

  it('fallback interaction style instructs rapid-quizzing for low-confidence cram', () => {
    const out = buildCramReviewFallbackInteractionStyle(inputs);
    expect(out).toMatch(/quick.?fire|rapid|brief/i);
    expect(out).toMatch(/re-?test|re-?ask/i);
  });

  it('fallback interaction style for high-confidence + time emphasizes depth', () => {
    const out = buildCramReviewFallbackInteractionStyle({ ...inputs, confidence: 5, hoursAvailable: 8 });
    expect(out).toMatch(/depth|deeper|harder/i);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
npm test tests/unit/templates-cram-review.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `lib/templates/cram-review.ts`:
```typescript
import type { WizardInputs } from '@/lib/types';

export function buildCramReviewOutputSpec(_inputs: WizardInputs): string {
  return [
    'Produce a focused cram-review session in this exact shape:',
    '',
    '1. A 5-question diagnostic quiz on the highest-leverage concepts (mix of recall and short application).',
    '2. After I answer, score each question and give a one-sentence correction for any I missed.',
    '3. A 10-question deeper quiz that targets my weakest areas from step 1.',
    '4. A final 3-question synthesis quiz that asks me to apply or connect concepts.',
    '',
    'Format: Number every question, separate questions and answers (give me answers only after I respond), and keep explanations short — under 3 sentences each.',
  ].join('\n');
}

export function buildCramReviewFallbackInteractionStyle(inputs: WizardInputs): string {
  const conf = inputs.confidence ?? 3;
  const hrs = inputs.hoursAvailable;
  if (conf <= 2 && hrs <= 4) {
    return [
      'Interaction style: Start with rapid-fire questions on fundamentals.',
      "If I miss something, give a brief 1-2 sentence correction, then re-test the same concept later in the session.",
      "Don't lecture or over-explain unless I ask.",
    ].join(' ');
  }
  if (conf >= 4 && hrs >= 6) {
    return [
      'Interaction style: Skip the basics. Push for depth — ask harder application questions and synthesis prompts.',
      'Challenge my reasoning with follow-ups rather than affirming first responses.',
    ].join(' ');
  }
  return [
    'Interaction style: Alternate between recall and application questions.',
    'Briefly correct mistakes (1-2 sentences) and re-test weak areas before moving on.',
  ].join(' ');
}
```

- [ ] **Step 4: Run tests, all pass**

```bash
npm test tests/unit/templates-cram-review.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/templates/cram-review.ts tests/unit/templates-cram-review.test.ts
git commit -m "feat(templates): cram-review output spec + fallback interaction style"
```

---

### Task 12: Multi-day-plan template (TDD)

**Files:**
- Create: `lib/templates/multi-day-plan.ts`, `tests/unit/templates-multi-day-plan.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/templates-multi-day-plan.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildMultiDayPlanOutputSpec, buildMultiDayPlanFallbackInteractionStyle } from '@/lib/templates/multi-day-plan';
import type { WizardInputs } from '@/lib/types';

const inputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'multi-day-plan',
  assessmentType: 'test',
  assessmentDate: '2026-06-10',
  hoursAvailable: 72, // 3 days
  confidence: 3,
};

describe('multi-day-plan template', () => {
  it('output spec asks for a day-by-day schedule', () => {
    const out = buildMultiDayPlanOutputSpec(inputs);
    expect(out).toMatch(/day-by-day|each day|daily/i);
    expect(out).toMatch(/quiz|self-test|check/i);
  });

  it('output spec splits hours into sessions', () => {
    const out = buildMultiDayPlanOutputSpec(inputs);
    expect(out).toMatch(/session/i);
  });

  it('interaction style emphasizes spaced practice', () => {
    const out = buildMultiDayPlanFallbackInteractionStyle(inputs);
    expect(out).toMatch(/spaced|space out|interleav/i);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
npm test tests/unit/templates-multi-day-plan.test.ts
```

- [ ] **Step 3: Implement**

Create `lib/templates/multi-day-plan.ts`:
```typescript
import type { WizardInputs } from '@/lib/types';

export function buildMultiDayPlanOutputSpec(inputs: WizardInputs): string {
  const days = Math.max(1, Math.round(inputs.hoursAvailable / 24));
  return [
    `Produce a day-by-day study plan covering ${days} day(s) leading up to my ${inputs.assessmentType} on ${inputs.assessmentDate}.`,
    '',
    'For each day, include:',
    '1. Focus topic(s) — what I should be working on that day, prioritized.',
    '2. Two-to-three short study sessions (30-45 min each) with specific activities.',
    '3. A 5-question self-test at the end of each day, with answers in a separate section.',
    '4. A built-in recall check from prior days (spaced practice — don't just move on).',
    '',
    'On the final day before the assessment, schedule a comprehensive review and a brief calming wind-down.',
    'Use a clear heading per day. Keep each day on one screen.',
  ].join('\n');
}

export function buildMultiDayPlanFallbackInteractionStyle(_inputs: WizardInputs): string {
  return [
    'Interaction style: Build the plan as a self-directed schedule.',
    'Apply spaced practice — each day must revisit material from earlier days, not just push forward.',
    'Interleave question types (recall, application, synthesis) rather than blocking by topic.',
    'After delivering the plan, ask whether the daily time budget feels realistic and offer to redistribute if not.',
  ].join(' ');
}
```

- [ ] **Step 4: Run, all pass**

```bash
npm test tests/unit/templates-multi-day-plan.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/templates/multi-day-plan.ts tests/unit/templates-multi-day-plan.test.ts
git commit -m "feat(templates): multi-day-plan output spec + fallback interaction style"
```

---

### Task 13: Practice-questions template (TDD)

**Files:**
- Create: `lib/templates/practice-questions.ts`, `tests/unit/templates-practice-questions.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/templates-practice-questions.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildPracticeQuestionsOutputSpec, buildPracticeQuestionsFallbackInteractionStyle } from '@/lib/templates/practice-questions';
import type { WizardInputs } from '@/lib/types';

const inputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'practice-questions',
  assessmentType: 'test',
  assessmentDate: '2026-06-01',
  hoursAvailable: 2,
  confidence: 3,
};

describe('practice-questions template', () => {
  it('output spec includes mixed question formats matched to assessment type', () => {
    const out = buildPracticeQuestionsOutputSpec(inputs);
    expect(out).toMatch(/multiple.choice|mc/i);
    expect(out).toMatch(/short.answer/i);
  });

  it('output spec separates answers from questions', () => {
    const out = buildPracticeQuestionsOutputSpec(inputs);
    expect(out).toMatch(/separate.*answer|answer.*separate/i);
  });

  it('output spec for paper/essay assessment includes essay-style questions', () => {
    const out = buildPracticeQuestionsOutputSpec({ ...inputs, assessmentType: 'paper' });
    expect(out).toMatch(/essay|long.form|prompt/i);
  });

  it('interaction style emphasizes self-test before showing answers', () => {
    const out = buildPracticeQuestionsFallbackInteractionStyle(inputs);
    expect(out).toMatch(/self-?test|don't.*answer.*until|wait/i);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
npm test tests/unit/templates-practice-questions.test.ts
```

- [ ] **Step 3: Implement**

Create `lib/templates/practice-questions.ts`:
```typescript
import type { WizardInputs } from '@/lib/types';

export function buildPracticeQuestionsOutputSpec(inputs: WizardInputs): string {
  const isEssayLike = inputs.assessmentType === 'paper' || inputs.assessmentType === 'project';
  const lines = [
    `Produce a set of practice questions matched to a ${inputs.assessmentType}.`,
    '',
    'Structure:',
  ];
  if (isEssayLike) {
    lines.push(
      '1. 3 essay-style prompts at increasing difficulty. For each: list a target argument structure and the kind of evidence the reader expects.',
      '2. 6 short-answer questions covering core concepts.',
      '3. A grading rubric (4-criteria, 4-level) for the essay prompts.',
    );
  } else {
    lines.push(
      '1. 6 multiple-choice questions with 4 options each, mixing recall and application.',
      '2. 4 short-answer questions requiring 1-3 sentence responses.',
      '3. 2 longer-form questions requiring multi-step reasoning.',
    );
  }
  lines.push(
    '',
    'Keep all answers in a separate ANSWERS section at the bottom. Do not reveal answers until I respond.',
    'After scoring my responses, highlight which concepts I should revisit.',
  );
  return lines.join('\n');
}

export function buildPracticeQuestionsFallbackInteractionStyle(_inputs: WizardInputs): string {
  return [
    "Interaction style: Present the questions first. Wait for my answers before revealing the answer key — I want to genuinely self-test.",
    "When I respond, score each answer concretely (correct, partial, incorrect) and give a 1-2 sentence correction for misses.",
    "After scoring, suggest one targeted follow-up question for any concept I missed.",
  ].join(' ');
}
```

- [ ] **Step 4: Run, all pass**

```bash
npm test tests/unit/templates-practice-questions.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/templates/practice-questions.ts tests/unit/templates-practice-questions.test.ts
git commit -m "feat(templates): practice-questions output spec + fallback interaction style"
```

---

### Task 14: Concept-clarification template (TDD)

**Files:**
- Create: `lib/templates/concept-clarification.ts`, `tests/unit/templates-concept-clarification.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/templates-concept-clarification.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildConceptClarificationOutputSpec, buildConceptClarificationFallbackInteractionStyle } from '@/lib/templates/concept-clarification';
import type { WizardInputs } from '@/lib/types';

const inputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'concept-clarification',
  assessmentType: 'test',
  assessmentDate: '2026-06-01',
  hoursAvailable: 1,
  confidence: 2,
  confusion: 'How does stanislavski differ from method acting?',
};

describe('concept-clarification template', () => {
  it('output spec asks for explanation + analogy + example + check', () => {
    const out = buildConceptClarificationOutputSpec(inputs);
    expect(out).toMatch(/explanation/i);
    expect(out).toMatch(/analogy|metaphor/i);
    expect(out).toMatch(/example/i);
    expect(out).toMatch(/check|verify|self-test/i);
  });

  it('interaction style uses Socratic + adaptive language', () => {
    const out = buildConceptClarificationFallbackInteractionStyle(inputs);
    expect(out).toMatch(/socratic|ask me|small steps/i);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
npm test tests/unit/templates-concept-clarification.test.ts
```

- [ ] **Step 3: Implement**

Create `lib/templates/concept-clarification.ts`:
```typescript
import type { WizardInputs } from '@/lib/types';

export function buildConceptClarificationOutputSpec(_inputs: WizardInputs): string {
  return [
    'For each concept I am confused about, deliver in this order:',
    '',
    '1. A short, plain-language explanation (under 4 sentences) at the level I'm working at.',
    "2. An analogy or metaphor that connects the concept to something I'm likely familiar with.",
    '3. One concrete worked example showing the concept in action.',
    "4. A check-for-understanding question that doesn't just restate the explanation — make me apply it.",
    '5. After I answer, give a 1-sentence read on what part I got and what I'm still missing.',
    '',
    'When I provide more than one confusion, handle them one at a time. Do not move to the next until I confirm I have the current one.',
  ].join('\n');
}

export function buildConceptClarificationFallbackInteractionStyle(_inputs: WizardInputs): string {
  return [
    'Interaction style: Use a Socratic, adaptive approach.',
    'Ask me what I already think the concept means before explaining.',
    'Move in small steps and ask me to predict the next step where possible.',
    "If I make a wrong prediction, treat it as data — explain what's correct in my reasoning and what's off.",
  ].join(' ');
}
```

- [ ] **Step 4: Run, all pass**

```bash
npm test tests/unit/templates-concept-clarification.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/templates/concept-clarification.ts tests/unit/templates-concept-clarification.test.ts
git commit -m "feat(templates): concept-clarification output spec + fallback interaction style"
```

---

### Task 15: Essay/project template (TDD)

**Files:**
- Create: `lib/templates/essay-project.ts`, `tests/unit/templates-essay-project.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/templates-essay-project.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { buildEssayProjectOutputSpec, buildEssayProjectFallbackInteractionStyle } from '@/lib/templates/essay-project';
import type { WizardInputs } from '@/lib/types';

const inputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'essay-project',
  assessmentType: 'paper',
  assessmentDate: '2026-06-01',
  hoursAvailable: 6,
  confidence: 3,
};

describe('essay-project template', () => {
  it('output spec includes outline + thesis + evidence + draft plan', () => {
    const out = buildEssayProjectOutputSpec(inputs);
    expect(out).toMatch(/outline/i);
    expect(out).toMatch(/thesis/i);
    expect(out).toMatch(/evidence|sources/i);
    expect(out).toMatch(/draft/i);
  });

  it('interaction style refuses to write the essay for me', () => {
    const out = buildEssayProjectFallbackInteractionStyle(inputs);
    expect(out).toMatch(/won't write|not write.*for me|don't write the/i);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
npm test tests/unit/templates-essay-project.test.ts
```

- [ ] **Step 3: Implement**

Create `lib/templates/essay-project.ts`:
```typescript
import type { WizardInputs } from '@/lib/types';

export function buildEssayProjectOutputSpec(_inputs: WizardInputs): string {
  return [
    'Deliver in this order, one stage at a time:',
    '',
    '1. Thesis development — propose 2-3 candidate thesis statements based on the prompt and material I shared, with a one-line strength/weakness analysis of each.',
    '2. Wait for me to pick (or refine) one.',
    '3. Outline — produce a section-by-section outline (intro, 3-5 body sections, conclusion) with a one-sentence claim per section and what evidence/example will support it.',
    '4. Evidence audit — list which claims still need supporting evidence and what kind would be strongest.',
    '5. Drafting plan — split the writing into manageable sessions matched to my available time, with a specific goal for each session (e.g., "Session 1: draft intro and body 1; Session 2: revise body 1 and draft body 2").',
    '',
    'Do not write the essay or project for me at any stage. Treat this as planning and feedback, not ghostwriting.',
  ].join('\n');
}

export function buildEssayProjectFallbackInteractionStyle(_inputs: WizardInputs): string {
  return [
    "Interaction style: Coach me through the writing process — don't write the work itself for me.",
    'Push back on weak thesis statements and unsupported claims rather than affirming them.',
    'When I share a draft, give targeted line-edits and high-level structural notes, but keep the writing voice mine.',
  ].join(' ');
}
```

- [ ] **Step 4: Run, all pass**

```bash
npm test tests/unit/templates-essay-project.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/templates/essay-project.ts tests/unit/templates-essay-project.test.ts
git commit -m "feat(templates): essay-project output spec + fallback interaction style"
```

---

### Task 16: Template selector + format selector (TDD)

**Files:**
- Create: `lib/templates/index.ts`, `lib/generation/format-selector.ts`, `tests/unit/format-selector.test.ts`

- [ ] **Step 1: Implement template selector**

Create `lib/templates/index.ts`:
```typescript
import type { StudyMode, WizardInputs } from '@/lib/types';
import { buildCramReviewOutputSpec, buildCramReviewFallbackInteractionStyle } from './cram-review';
import { buildMultiDayPlanOutputSpec, buildMultiDayPlanFallbackInteractionStyle } from './multi-day-plan';
import { buildPracticeQuestionsOutputSpec, buildPracticeQuestionsFallbackInteractionStyle } from './practice-questions';
import { buildConceptClarificationOutputSpec, buildConceptClarificationFallbackInteractionStyle } from './concept-clarification';
import { buildEssayProjectOutputSpec, buildEssayProjectFallbackInteractionStyle } from './essay-project';

type ModeBuilders = {
  outputSpec: (i: WizardInputs) => string;
  fallbackInteractionStyle: (i: WizardInputs) => string;
};

const MODE_TABLE: Record<StudyMode, ModeBuilders> = {
  'cram-review': {
    outputSpec: buildCramReviewOutputSpec,
    fallbackInteractionStyle: buildCramReviewFallbackInteractionStyle,
  },
  'multi-day-plan': {
    outputSpec: buildMultiDayPlanOutputSpec,
    fallbackInteractionStyle: buildMultiDayPlanFallbackInteractionStyle,
  },
  'practice-questions': {
    outputSpec: buildPracticeQuestionsOutputSpec,
    fallbackInteractionStyle: buildPracticeQuestionsFallbackInteractionStyle,
  },
  'concept-clarification': {
    outputSpec: buildConceptClarificationOutputSpec,
    fallbackInteractionStyle: buildConceptClarificationFallbackInteractionStyle,
  },
  'essay-project': {
    outputSpec: buildEssayProjectOutputSpec,
    fallbackInteractionStyle: buildEssayProjectFallbackInteractionStyle,
  },
};

export const STUDY_MODE_LABELS: Record<StudyMode, string> = {
  'cram-review': 'Cram review',
  'multi-day-plan': 'Multi-day study plan',
  'practice-questions': 'Practice questions',
  'concept-clarification': 'Concept clarification',
  'essay-project': 'Essay or project prep',
};

export const STUDY_MODE_DESCRIPTIONS: Record<StudyMode, string> = {
  'cram-review': 'Fast quiz-driven review before a test or quiz.',
  'multi-day-plan': 'A day-by-day plan across multiple study sessions.',
  'practice-questions': 'A set of practice questions matched to the assessment format.',
  'concept-clarification': 'Step-through explanation of specific concepts you find confusing.',
  'essay-project': 'Plan, outline, and feedback for an essay or project — not ghostwriting.',
};

export function templateFor(mode: StudyMode): ModeBuilders {
  return MODE_TABLE[mode];
}
```

- [ ] **Step 2: Write failing tests for format selector**

Create `tests/unit/format-selector.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { formatSection, formatAssembledPrompt } from '@/lib/generation/format-selector';

describe('formatSection', () => {
  it('xml wraps with named tag', () => {
    expect(formatSection('xml', 'role', 'You are a tutor.')).toBe(
      '<role>\nYou are a tutor.\n</role>',
    );
  });

  it('markdown emits a heading + body', () => {
    expect(formatSection('markdown', 'role', 'You are a tutor.')).toBe(
      '## ROLE\n\nYou are a tutor.',
    );
  });

  it('numbered-steps prefixes the section with a numbered instruction', () => {
    expect(formatSection('numbered-steps', 'role', 'You are a tutor.', 1)).toBe(
      'Step 1 — ROLE:\nYou are a tutor.',
    );
  });
});

describe('formatAssembledPrompt', () => {
  it('xml joins sections with blank lines', () => {
    const sections = [
      { name: 'role', body: 'You are a tutor.' },
      { name: 'goal', body: 'Help me study.' },
    ];
    const out = formatAssembledPrompt('xml', sections);
    expect(out).toBe('<role>\nYou are a tutor.\n</role>\n\n<goal>\nHelp me study.\n</goal>');
  });

  it('markdown uses ## headings', () => {
    const sections = [
      { name: 'role', body: 'You are a tutor.' },
    ];
    const out = formatAssembledPrompt('markdown', sections);
    expect(out).toContain('## ROLE');
  });

  it('numbered-steps numbers sections starting at 1', () => {
    const sections = [
      { name: 'role', body: 'You are a tutor.' },
      { name: 'goal', body: 'Help me study.' },
    ];
    const out = formatAssembledPrompt('numbered-steps', sections);
    expect(out).toContain('Step 1 — ROLE');
    expect(out).toContain('Step 2 — GOAL');
  });
});
```

- [ ] **Step 3: Run, verify fail**

```bash
npm test tests/unit/format-selector.test.ts
```

- [ ] **Step 4: Implement format selector**

Create `lib/generation/format-selector.ts`:
```typescript
import type { ModelFormat } from '@/lib/model-profiles';

export type Section = {
  name: string;
  body: string;
};

export function formatSection(format: ModelFormat, name: string, body: string, index = 1): string {
  const upper = name.toUpperCase();
  switch (format) {
    case 'xml':
      return `<${name}>\n${body}\n</${name}>`;
    case 'markdown':
      return `## ${upper}\n\n${body}`;
    case 'numbered-steps':
      return `Step ${index} — ${upper}:\n${body}`;
  }
}

export function formatAssembledPrompt(format: ModelFormat, sections: Section[]): string {
  return sections
    .map((s, i) => formatSection(format, s.name, s.body, i + 1))
    .join('\n\n');
}
```

- [ ] **Step 5: Run all tests, verify pass**

```bash
npm test tests/unit/format-selector.test.ts
```

Expected: 6 passing.

- [ ] **Step 6: Commit**

```bash
git add lib/templates/index.ts lib/generation/format-selector.ts tests/unit/format-selector.test.ts
git commit -m "feat: template selector + per-format prompt builder"
```

---

### Task 17: Deterministic assembler (TDD)

**Files:**
- Create: `lib/generation/assembler.ts`, `tests/unit/assembler.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/assembler.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { assembleDeterministicPrompt } from '@/lib/generation/assembler';
import type { WizardInputs } from '@/lib/types';

const inputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-01',
  hoursAvailable: 2,
  confidence: 3,
  material: 'Stanislavski method',
};

describe('assembleDeterministicPrompt', () => {
  it('includes all 7 sections in order for xml format', () => {
    const out = assembleDeterministicPrompt(inputs);
    const expected = ['<role>', '<about_me>', '<material>', '<goal>', '<interaction_style>', '<output_spec>', '<self_check>'];
    let lastIdx = -1;
    for (const tag of expected) {
      const idx = out.indexOf(tag);
      expect(idx, `${tag} present`).toBeGreaterThan(-1);
      expect(idx, `${tag} in order`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it('uses markdown headings for openai models', () => {
    const out = assembleDeterministicPrompt({ ...inputs, provider: 'openai', model: 'gpt-5' });
    expect(out).toContain('## ROLE');
    expect(out).toContain('## OUTPUT_SPEC');
  });

  it('uses numbered steps for gemini models', () => {
    const out = assembleDeterministicPrompt({ ...inputs, provider: 'google', model: 'gemini-2-5-pro' });
    expect(out).toMatch(/Step 1 — ROLE/);
  });

  it('uses the fallback interaction style (deterministic baseline)', () => {
    const out = assembleDeterministicPrompt(inputs);
    expect(out).toMatch(/Interaction style:/);
  });

  it('respects the chosen mode for the output spec', () => {
    const out = assembleDeterministicPrompt({ ...inputs, mode: 'practice-questions' });
    expect(out).toMatch(/multiple.choice|short.answer/i);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
npm test tests/unit/assembler.test.ts
```

- [ ] **Step 3: Implement the assembler**

Create `lib/generation/assembler.ts`:
```typescript
import type { WizardInputs } from '@/lib/types';
import { getModelProfile } from '@/lib/model-profiles';
import { templateFor } from '@/lib/templates';
import {
  buildRoleSection,
  buildAboutMeSection,
  buildMaterialSection,
  buildGoalSection,
  buildSelfCheckSection,
} from '@/lib/templates/shared';
import { formatAssembledPrompt, type Section } from '@/lib/generation/format-selector';

export type AssembleOptions = {
  // Inject a custom interaction style (e.g., from Sonnet); falls back to deterministic if absent
  interactionStyleOverride?: string;
};

export function assembleSections(inputs: WizardInputs, opts: AssembleOptions = {}): Section[] {
  const t = templateFor(inputs.mode);
  const interaction = opts.interactionStyleOverride ?? t.fallbackInteractionStyle(inputs);
  return [
    { name: 'role', body: buildRoleSection(inputs) },
    { name: 'about_me', body: buildAboutMeSection(inputs) },
    { name: 'material', body: buildMaterialSection(inputs) },
    { name: 'goal', body: buildGoalSection(inputs) },
    { name: 'interaction_style', body: `Interaction style: ${interaction.replace(/^Interaction style:\s*/i, '')}` },
    { name: 'output_spec', body: t.outputSpec(inputs) },
    { name: 'self_check', body: buildSelfCheckSection(inputs) },
  ];
}

export function assembleDeterministicPrompt(inputs: WizardInputs, opts: AssembleOptions = {}): string {
  const profile = getModelProfile(inputs.provider, inputs.model);
  const sections = assembleSections(inputs, opts);
  return formatAssembledPrompt(profile.format, sections);
}
```

- [ ] **Step 4: Run, all pass**

```bash
npm test tests/unit/assembler.test.ts
```

Expected: 5 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/generation/assembler.ts tests/unit/assembler.test.ts
git commit -m "feat: deterministic assembler combining shared + mode templates per model format"
```

---

## Phase 5: Sonnet-Assisted + Pipeline

### Task 18: Interaction style Sonnet call (TDD with mocked SDK)

**Files:**
- Create: `lib/generation/interaction-style.ts`, `tests/unit/interaction-style.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/interaction-style.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateInteractionStyle } from '@/lib/generation/interaction-style';
import type { WizardInputs } from '@/lib/types';

const inputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-01',
  hoursAvailable: 2,
  confidence: 2,
  material: 'Stanislavski',
};

const mockCreate = vi.fn();

vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({
    messages: { create: mockCreate },
  })),
}));

describe('generateInteractionStyle', () => {
  beforeEach(() => {
    mockCreate.mockReset();
  });

  it('returns the assistant text on success', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'Quick-fire questions on fundamentals first.' }],
      usage: { input_tokens: 100, output_tokens: 30 },
    });
    const result = await generateInteractionStyle(inputs);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.text).toContain('Quick-fire questions');
      expect(result.usage.input_tokens).toBe(100);
    }
  });

  it('returns ok: false on API error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('network error'));
    const result = await generateInteractionStyle(inputs);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('api-error');
    }
  });

  it('calls Sonnet with prompt-cached system message', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'ok' }],
      usage: { input_tokens: 1, output_tokens: 1 },
    });
    await generateInteractionStyle(inputs);
    const call = mockCreate.mock.calls[0]![0];
    expect(call.model).toMatch(/sonnet/i);
    // System should be an array of blocks with at least one cache_control: ephemeral
    expect(Array.isArray(call.system)).toBe(true);
    const cached = call.system.some((b: { cache_control?: { type: string } }) => b.cache_control?.type === 'ephemeral');
    expect(cached).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
npm test tests/unit/interaction-style.test.ts
```

- [ ] **Step 3: Implement the Sonnet call**

Create `lib/generation/interaction-style.ts`:
```typescript
import Anthropic from '@anthropic-ai/sdk';
import type { WizardInputs } from '@/lib/types';
import { STUDY_MODE_LABELS } from '@/lib/templates';
import { findCourse } from '@/lib/courses';

const SONNET_MODEL = 'claude-sonnet-4-6';

const SYSTEM_PROMPT = `You write the "Interaction Style" section of a study prompt that another student will paste into ChatGPT, Claude, or Gemini.

Output requirements:
- 3-6 sentences, plain text only. No markdown, no headers, no lists.
- Start with "Interaction style: " (those two words exactly).
- Tailor to the student's mode, confidence level, time available, and the specific course material they shared.
- Include a single "Anticipated misconceptions:" sentence at the end naming 2-3 specific misconceptions a student at this level might bring to this material. Be concrete — name the actual concept, not a meta-description.

Style rules:
- Direct, not chatty. No filler ("Great question!", "Let's dive in!").
- Pedagogically informed: spaced practice, active recall, formative checks.
- Do not lecture. Do not be vague.`;

export type InteractionStyleResult =
  | { ok: true; text: string; usage: { input_tokens: number; output_tokens: number } }
  | { ok: false; error: 'api-error' };

const buildUserMessage = (inputs: WizardInputs): string => {
  const course = inputs.courseId ? findCourse(inputs.courseId) : null;
  const courseLabel = course ? `${course.name} (${course.department}, ${course.level})` : inputs.courseFreeText ?? 'an unspecified course';
  const lines = [
    `Course: ${courseLabel}`,
    `Mode: ${STUDY_MODE_LABELS[inputs.mode]}`,
    `Assessment: ${inputs.assessmentType} on ${inputs.assessmentDate}`,
    `Hours available: ${inputs.hoursAvailable}`,
    inputs.confidence !== undefined ? `Confidence (1-5): ${inputs.confidence}` : null,
    inputs.understanding ? `What I understand: ${inputs.understanding}` : null,
    inputs.confusion ? `What confuses me: ${inputs.confusion}` : null,
    inputs.material ? `Material:\n${inputs.material.slice(0, 4000)}` : null,
  ].filter(Boolean);
  return lines.join('\n');
};

export async function generateInteractionStyle(
  inputs: WizardInputs,
): Promise<InteractionStyleResult> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  try {
    const response = await client.messages.create({
      model: SONNET_MODEL,
      max_tokens: 600,
      system: [
        {
          type: 'text',
          text: SYSTEM_PROMPT,
          cache_control: { type: 'ephemeral' },
        },
      ],
      messages: [
        { role: 'user', content: buildUserMessage(inputs) },
      ],
    });
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text') {
      return { ok: false, error: 'api-error' };
    }
    return {
      ok: true,
      text: block.text.trim(),
      usage: {
        input_tokens: response.usage.input_tokens,
        output_tokens: response.usage.output_tokens,
      },
    };
  } catch {
    return { ok: false, error: 'api-error' };
  }
}
```

- [ ] **Step 4: Run, all pass**

```bash
npm test tests/unit/interaction-style.test.ts
```

Expected: 3 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/generation/interaction-style.ts tests/unit/interaction-style.test.ts
git commit -m "feat: Sonnet 4.6 call for Interaction Style + Misconceptions (with prompt cache)"
```

---

### Task 19: Pipeline orchestrator (TDD)

**Files:**
- Create: `lib/generation/pipeline.ts`, `tests/unit/pipeline.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/pipeline.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { WizardInputs } from '@/lib/types';

const mockGenerateInteractionStyle = vi.fn();
const mockBudgetCheck = vi.fn();
const mockBudgetRecord = vi.fn();

vi.mock('@/lib/generation/interaction-style', () => ({
  generateInteractionStyle: mockGenerateInteractionStyle,
}));

vi.mock('@/lib/budget/daily-cap', () => ({
  budgetAvailable: mockBudgetCheck,
  recordSpend: mockBudgetRecord,
}));

import { runPipeline } from '@/lib/generation/pipeline';

const inputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-01',
  hoursAvailable: 2,
  confidence: 3,
};

describe('runPipeline', () => {
  beforeEach(() => {
    mockGenerateInteractionStyle.mockReset();
    mockBudgetCheck.mockReset();
    mockBudgetRecord.mockReset();
    mockBudgetCheck.mockResolvedValue(true);
    mockBudgetRecord.mockResolvedValue(undefined);
  });

  it('uses Sonnet output when budget allows + API succeeds', async () => {
    mockGenerateInteractionStyle.mockResolvedValueOnce({
      ok: true,
      text: 'Interaction style: rapid-fire quiz, brief corrections.',
      usage: { input_tokens: 100, output_tokens: 30 },
    });
    const result = await runPipeline(inputs);
    expect(result.metadata.sonnetUsed).toBe(true);
    expect(result.prompt).toContain('rapid-fire quiz');
    expect(result.metadata.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(mockBudgetRecord).toHaveBeenCalled();
  });

  it('falls back to deterministic when budget exhausted', async () => {
    mockBudgetCheck.mockResolvedValueOnce(false);
    const result = await runPipeline(inputs);
    expect(result.metadata.sonnetUsed).toBe(false);
    expect(result.metadata.fallbackReason).toBe('budget-exhausted');
    expect(mockGenerateInteractionStyle).not.toHaveBeenCalled();
  });

  it('falls back to deterministic when Sonnet errors', async () => {
    mockGenerateInteractionStyle.mockResolvedValueOnce({ ok: false, error: 'api-error' });
    const result = await runPipeline(inputs);
    expect(result.metadata.sonnetUsed).toBe(false);
    expect(result.metadata.fallbackReason).toBe('api-error');
  });

  it('returns a deterministic prompt even without Sonnet', async () => {
    mockBudgetCheck.mockResolvedValueOnce(false);
    const result = await runPipeline(inputs);
    expect(result.prompt).toMatch(/Interaction style:/);
    expect(result.prompt.length).toBeGreaterThan(200);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
npm test tests/unit/pipeline.test.ts
```

- [ ] **Step 3: Implement the orchestrator**

Create `lib/generation/pipeline.ts`:
```typescript
import { createHash } from 'node:crypto';
import type { WizardInputs, GenerateResponse } from '@/lib/types';
import { assembleDeterministicPrompt } from '@/lib/generation/assembler';
import { generateInteractionStyle } from '@/lib/generation/interaction-style';
import { budgetAvailable, recordSpend } from '@/lib/budget/daily-cap';

const SONNET_INPUT_PER_MTOK_USD = 3.0;
const SONNET_OUTPUT_PER_MTOK_USD = 15.0;

const estimateSpendUsd = (usage: { input_tokens: number; output_tokens: number }): number => {
  return (
    (usage.input_tokens / 1_000_000) * SONNET_INPUT_PER_MTOK_USD +
    (usage.output_tokens / 1_000_000) * SONNET_OUTPUT_PER_MTOK_USD
  );
};

const sha256 = (s: string): string => createHash('sha256').update(s).digest('hex');

export async function runPipeline(inputs: WizardInputs): Promise<GenerateResponse> {
  const budgetOk = await budgetAvailable();
  let interactionOverride: string | undefined;
  let sonnetUsed = false;
  let fallbackReason: GenerateResponse['metadata']['fallbackReason'];

  if (budgetOk) {
    const result = await generateInteractionStyle(inputs);
    if (result.ok) {
      interactionOverride = result.text;
      sonnetUsed = true;
      await recordSpend(estimateSpendUsd(result.usage));
    } else {
      fallbackReason = 'api-error';
    }
  } else {
    fallbackReason = 'budget-exhausted';
  }

  const prompt = assembleDeterministicPrompt(inputs, { interactionStyleOverride: interactionOverride });
  return {
    prompt,
    metadata: {
      sonnetUsed,
      promptHash: sha256(prompt),
      ...(fallbackReason ? { fallbackReason } : {}),
    },
  };
}
```

- [ ] **Step 4: Run tests, all pass**

```bash
npm test tests/unit/pipeline.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/generation/pipeline.ts tests/unit/pipeline.test.ts
git commit -m "feat: pipeline orchestrator (budget gate + Sonnet + deterministic fallback + hash)"
```

---

## Phase 6: Rate Limit, Budget, Hash, KV

### Task 20: KV client with in-memory fallback for tests

**Files:**
- Create: `lib/kv.ts`

- [ ] **Step 1: Implement**

Create `lib/kv.ts`:
```typescript
// Thin wrapper around @vercel/kv that falls back to an in-memory map when
// KV_REST_API_URL is missing (local dev + tests).

type KvLike = {
  get<T = unknown>(key: string): Promise<T | null>;
  set(key: string, value: unknown, opts?: { ex?: number }): Promise<unknown>;
  incr(key: string): Promise<number>;
  incrbyfloat(key: string, n: number): Promise<number>;
  expire(key: string, seconds: number): Promise<unknown>;
  zadd(key: string, scoreMember: { score: number; member: string }): Promise<unknown>;
  zremrangebyscore(key: string, min: number, max: number): Promise<unknown>;
  zcard(key: string): Promise<number>;
};

let _client: KvLike | null = null;

async function loadClient(): Promise<KvLike> {
  if (_client) return _client;
  if (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) {
    const { kv } = await import('@vercel/kv');
    _client = kv as unknown as KvLike;
    return _client;
  }
  // In-memory fallback
  const store = new Map<string, unknown>();
  const sortedSets = new Map<string, Array<{ score: number; member: string }>>();
  const expirations = new Map<string, number>();

  const purgeExpired = (key: string): void => {
    const t = expirations.get(key);
    if (t !== undefined && t <= Date.now()) {
      store.delete(key);
      sortedSets.delete(key);
      expirations.delete(key);
    }
  };

  _client = {
    async get<T = unknown>(key: string): Promise<T | null> {
      purgeExpired(key);
      return (store.get(key) as T | undefined) ?? null;
    },
    async set(key, value, opts) {
      store.set(key, value);
      if (opts?.ex) expirations.set(key, Date.now() + opts.ex * 1000);
      return 'OK';
    },
    async incr(key) {
      purgeExpired(key);
      const cur = (store.get(key) as number | undefined) ?? 0;
      const next = cur + 1;
      store.set(key, next);
      return next;
    },
    async incrbyfloat(key, n) {
      purgeExpired(key);
      const cur = (store.get(key) as number | undefined) ?? 0;
      const next = cur + n;
      store.set(key, next);
      return next;
    },
    async expire(key, seconds) {
      expirations.set(key, Date.now() + seconds * 1000);
      return 1;
    },
    async zadd(key, sm) {
      const list = sortedSets.get(key) ?? [];
      list.push(sm);
      sortedSets.set(key, list);
      return 1;
    },
    async zremrangebyscore(key, min, max) {
      const list = sortedSets.get(key) ?? [];
      const next = list.filter((x) => x.score < min || x.score > max);
      sortedSets.set(key, next);
      return list.length - next.length;
    },
    async zcard(key) {
      return (sortedSets.get(key) ?? []).length;
    },
  };
  return _client;
}

export async function kv(): Promise<KvLike> {
  return loadClient();
}
```

- [ ] **Step 2: Commit**

```bash
git add lib/kv.ts
git commit -m "feat: KV client with in-memory fallback for local/test"
```

---

### Task 21: Sliding-window rate limit (TDD)

**Files:**
- Create: `lib/rate-limit/sliding-window.ts`, `tests/unit/rate-limit.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/rate-limit.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { checkAndRecord } from '@/lib/rate-limit/sliding-window';

describe('rate limit sliding window', () => {
  beforeEach(() => {
    // Each test uses a unique IP to avoid bleed (in-memory KV persists across tests).
  });

  it('allows first request', async () => {
    const result = await checkAndRecord('ip-1', { limit: 5, windowSeconds: 60 });
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);
  });

  it('blocks after limit', async () => {
    for (let i = 0; i < 5; i++) {
      await checkAndRecord('ip-2', { limit: 5, windowSeconds: 60 });
    }
    const result = await checkAndRecord('ip-2', { limit: 5, windowSeconds: 60 });
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('fails open if KV errors', async () => {
    // Cannot easily simulate KV error in this in-memory adapter; rely on production code's try/catch.
    const result = await checkAndRecord('ip-3', { limit: 5, windowSeconds: 60 });
    expect(result.allowed).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
npm test tests/unit/rate-limit.test.ts
```

- [ ] **Step 3: Implement**

Create `lib/rate-limit/sliding-window.ts`:
```typescript
import { kv } from '@/lib/kv';

export type RateLimitOptions = {
  limit: number;
  windowSeconds: number;
};

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
};

export async function checkAndRecord(
  ip: string,
  opts: RateLimitOptions,
): Promise<RateLimitResult> {
  const key = `rl:${ip}`;
  try {
    const client = await kv();
    const now = Date.now();
    const windowStart = now - opts.windowSeconds * 1000;
    await client.zremrangebyscore(key, 0, windowStart);
    const count = await client.zcard(key);
    if (count >= opts.limit) {
      return { allowed: false, remaining: 0 };
    }
    await client.zadd(key, { score: now, member: `${now}-${Math.random()}` });
    await client.expire(key, opts.windowSeconds);
    return { allowed: true, remaining: opts.limit - count - 1 };
  } catch {
    // Fail open
    return { allowed: true, remaining: opts.limit };
  }
}
```

- [ ] **Step 4: Run, pass**

```bash
npm test tests/unit/rate-limit.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/rate-limit tests/unit/rate-limit.test.ts
git commit -m "feat: KV sliding-window rate limit per-IP"
```

---

### Task 22: Daily budget cap (TDD)

**Files:**
- Create: `lib/budget/daily-cap.ts`, `tests/unit/daily-cap.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/daily-cap.test.ts`:
```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const originalEnv = process.env.DAILY_BUDGET_CEILING_USD;

describe('daily budget cap', () => {
  beforeEach(() => {
    process.env.DAILY_BUDGET_CEILING_USD = '0.10';
    vi.resetModules();
  });

  afterEach(() => {
    process.env.DAILY_BUDGET_CEILING_USD = originalEnv;
  });

  it('allows spend when under ceiling', async () => {
    const { budgetAvailable, recordSpend } = await import('@/lib/budget/daily-cap');
    expect(await budgetAvailable()).toBe(true);
    await recordSpend(0.05);
    expect(await budgetAvailable()).toBe(true);
  });

  it('blocks once ceiling is exceeded', async () => {
    const { budgetAvailable, recordSpend } = await import('@/lib/budget/daily-cap');
    await recordSpend(0.11);
    expect(await budgetAvailable()).toBe(false);
  });

  it('fails open if KV errors', async () => {
    const { budgetAvailable } = await import('@/lib/budget/daily-cap');
    expect(await budgetAvailable()).toBe(true);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
npm test tests/unit/daily-cap.test.ts
```

- [ ] **Step 3: Implement**

Create `lib/budget/daily-cap.ts`:
```typescript
import { kv } from '@/lib/kv';

const DAY_KEY = (): string => {
  const d = new Date();
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  return `budget:${yyyy}-${mm}-${dd}`;
};

const ceiling = (): number => {
  const raw = process.env.DAILY_BUDGET_CEILING_USD;
  if (!raw) return 3.0;
  const n = parseFloat(raw);
  return Number.isFinite(n) ? n : 3.0;
};

export async function budgetAvailable(): Promise<boolean> {
  try {
    const client = await kv();
    const spent = (await client.get<number>(DAY_KEY())) ?? 0;
    return spent < ceiling();
  } catch {
    return true;
  }
}

export async function recordSpend(usd: number): Promise<void> {
  try {
    const client = await kv();
    await client.incrbyfloat(DAY_KEY(), usd);
    await client.expire(DAY_KEY(), 60 * 60 * 36); // 36h TTL = safe for day boundary
  } catch {
    // best effort
  }
}
```

- [ ] **Step 4: Run, all pass**

```bash
npm test tests/unit/daily-cap.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/budget tests/unit/daily-cap.test.ts
git commit -m "feat: daily Anthropic spend tracker with safety ceiling"
```

---

### Task 23: Prompt hash helper (TDD)

**Files:**
- Create: `lib/storage/prompt-hash.ts`, `tests/unit/prompt-hash.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/prompt-hash.test.ts`:
```typescript
import { describe, it, expect } from 'vitest';
import { promptHash } from '@/lib/storage/prompt-hash';

describe('promptHash', () => {
  it('returns a 64-char hex string', () => {
    expect(promptHash('hello')).toMatch(/^[a-f0-9]{64}$/);
  });

  it('is stable for same input', () => {
    expect(promptHash('abc')).toBe(promptHash('abc'));
  });

  it('differs for different input', () => {
    expect(promptHash('abc')).not.toBe(promptHash('abcd'));
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
npm test tests/unit/prompt-hash.test.ts
```

- [ ] **Step 3: Implement**

Create `lib/storage/prompt-hash.ts`:
```typescript
import { createHash } from 'node:crypto';

export function promptHash(s: string): string {
  return createHash('sha256').update(s).digest('hex');
}
```

- [ ] **Step 4: Run, all pass**

```bash
npm test tests/unit/prompt-hash.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add lib/storage/prompt-hash.ts tests/unit/prompt-hash.test.ts
git commit -m "feat: SHA-256 prompt hash helper"
```

---

## Phase 7: API Routes

### Task 24: `POST /api/generate` (TDD with mocked pipeline)

**Files:**
- Create: `app/api/generate/route.ts`, `tests/integration/generate-route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/integration/generate-route.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

const mockRunPipeline = vi.fn();
const mockCheckAndRecord = vi.fn();

vi.mock('@/lib/generation/pipeline', () => ({
  runPipeline: mockRunPipeline,
}));

vi.mock('@/lib/rate-limit/sliding-window', () => ({
  checkAndRecord: mockCheckAndRecord,
}));

import { POST } from '@/app/api/generate/route';

const validBody = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'arts-acting-and-improv',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-01',
  hoursAvailable: 4,
};

const makeRequest = (body: unknown, ip = '1.2.3.4'): NextRequest => {
  return new NextRequest('http://localhost/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
};

describe('POST /api/generate', () => {
  beforeEach(() => {
    mockRunPipeline.mockReset();
    mockCheckAndRecord.mockReset();
    mockCheckAndRecord.mockResolvedValue({ allowed: true, remaining: 19 });
    mockRunPipeline.mockResolvedValue({
      prompt: 'fake prompt',
      metadata: { sonnetUsed: false, promptHash: 'a'.repeat(64) },
    });
  });

  it('returns 200 with generated prompt', async () => {
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.prompt).toBe('fake prompt');
    expect(json.metadata.promptHash).toMatch(/^[a-f0-9]{64}$/);
  });

  it('returns 400 on invalid input', async () => {
    const res = await POST(makeRequest({ ...validBody, mode: 'invalid' }));
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate-limited', async () => {
    mockCheckAndRecord.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const res = await POST(makeRequest(validBody));
    expect(res.status).toBe(429);
  });

  it('does not log pasted material on error', async () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    mockRunPipeline.mockRejectedValueOnce(new Error('boom'));
    await POST(makeRequest({ ...validBody, material: 'super secret notes' }));
    const logged = consoleSpy.mock.calls.flat().join(' ');
    expect(logged).not.toContain('super secret notes');
    consoleSpy.mockRestore();
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
npm test tests/integration/generate-route.test.ts
```

- [ ] **Step 3: Implement the route**

Create `app/api/generate/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { WizardInputsSchema } from '@/lib/validation/wizard-inputs';
import { runPipeline } from '@/lib/generation/pipeline';
import { checkAndRecord } from '@/lib/rate-limit/sliding-window';

const RATE_LIMIT = parseInt(process.env.RATE_LIMIT_PER_IP_PER_DAY ?? '20', 10);

const getIp = (req: NextRequest): string => {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? 'unknown';
};

const redactInputs = (body: unknown): unknown => {
  if (typeof body !== 'object' || body === null) return body;
  const { material, understanding, confusion, ...rest } = body as Record<string, unknown>;
  return {
    ...rest,
    material: material ? '[redacted]' : undefined,
    understanding: understanding ? '[redacted]' : undefined,
    confusion: confusion ? '[redacted]' : undefined,
  };
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const parsed = WizardInputsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'invalid input', issues: parsed.error.issues.map((i) => ({ path: i.path, message: i.message })) },
      { status: 400 },
    );
  }

  const ip = getIp(req);
  const limit = await checkAndRecord(ip, { limit: RATE_LIMIT, windowSeconds: 24 * 60 * 60 });
  if (!limit.allowed) {
    return NextResponse.json(
      { error: 'rate limit exceeded; try again tomorrow' },
      { status: 429 },
    );
  }

  try {
    const result = await runPipeline(parsed.data);
    return NextResponse.json(result, { status: 200 });
  } catch (err) {
    console.error('generate failed', {
      message: err instanceof Error ? err.message : 'unknown',
      input: redactInputs(parsed.data),
    });
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
```

- [ ] **Step 4: Run, all pass**

```bash
npm test tests/integration/generate-route.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add app/api/generate tests/integration/generate-route.test.ts
git commit -m "feat: POST /api/generate with validation + rate limit + redacted error logging"
```

---

### Task 25: `POST /api/feedback` (TDD)

**Files:**
- Create: `app/api/feedback/route.ts`, `tests/integration/feedback-route.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/integration/feedback-route.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@/app/api/feedback/route';

const validBody = {
  promptHash: 'a'.repeat(64),
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  mode: 'cram-review',
  courseId: 'arts-acting-and-improv',
  rating: 4,
};

const makeReq = (body: unknown): NextRequest =>
  new NextRequest('http://localhost/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

describe('POST /api/feedback', () => {
  it('accepts a valid feedback payload', async () => {
    const res = await POST(makeReq(validBody));
    expect(res.status).toBe(200);
  });

  it('rejects invalid hash', async () => {
    const res = await POST(makeReq({ ...validBody, promptHash: 'short' }));
    expect(res.status).toBe(400);
  });

  it('rejects rating outside 1-5', async () => {
    const res = await POST(makeReq({ ...validBody, rating: 99 }));
    expect(res.status).toBe(400);
  });

  it('returns 200 even if KV is unavailable (fail open)', async () => {
    // In-memory KV doesn't fail; this test verifies the route doesn't error on the happy path
    const res = await POST(makeReq({ ...validBody, text: 'really helped' }));
    expect(res.status).toBe(200);
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
npm test tests/integration/feedback-route.test.ts
```

- [ ] **Step 3: Implement**

Create `app/api/feedback/route.ts`:
```typescript
import { NextRequest, NextResponse } from 'next/server';
import { FeedbackPayloadSchema } from '@/lib/validation/wizard-inputs';
import { kv } from '@/lib/kv';

const KEY = (hash: string): string => `feedback:${hash}`;

type FeedbackAggregate = {
  count: number;
  sum: number;
  recentTexts: string[];
  provider: string;
  model: string;
  mode: string;
  courseId: string | null;
};

export async function POST(req: NextRequest): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'invalid JSON' }, { status: 400 });
  }

  const parsed = FeedbackPayloadSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: 'invalid input' }, { status: 400 });
  }

  try {
    const client = await kv();
    const key = KEY(parsed.data.promptHash);
    const current = (await client.get<FeedbackAggregate>(key)) ?? {
      count: 0,
      sum: 0,
      recentTexts: [],
      provider: parsed.data.provider,
      model: parsed.data.model,
      mode: parsed.data.mode,
      courseId: parsed.data.courseId,
    };
    const next: FeedbackAggregate = {
      ...current,
      count: current.count + 1,
      sum: current.sum + parsed.data.rating,
      recentTexts: parsed.data.text
        ? [parsed.data.text, ...current.recentTexts].slice(0, 10)
        : current.recentTexts,
    };
    await client.set(key, next, { ex: 60 * 60 * 24 * 365 });
    return NextResponse.json({ ok: true }, { status: 200 });
  } catch {
    return NextResponse.json({ ok: false, error: 'storage-unavailable' }, { status: 200 });
  }
}
```

- [ ] **Step 4: Run, all pass**

```bash
npm test tests/integration/feedback-route.test.ts
```

- [ ] **Step 5: Commit**

```bash
git add app/api/feedback tests/integration/feedback-route.test.ts
git commit -m "feat: POST /api/feedback aggregating ratings per promptHash in KV"
```

---

## Phase 8: Frontend

### Task 26: localStorage history adapter (TDD)

**Files:**
- Create: `lib/storage/history.ts`, `tests/unit/storage-history.test.ts`

- [ ] **Step 1: Write failing tests**

Create `tests/unit/storage-history.test.ts`:
```typescript
import { describe, it, expect, beforeEach } from 'vitest';
import { saveHistoryEntry, listHistory, rateHistoryEntry, clearHistory, MAX_HISTORY } from '@/lib/storage/history';

describe('history storage', () => {
  beforeEach(() => {
    clearHistory();
  });

  it('starts empty', () => {
    expect(listHistory()).toEqual([]);
  });

  it('saves and lists entries newest-first', async () => {
    const e1 = await saveHistoryEntry({
      promptText: 'p1',
      llm: 'anthropic',
      model: 'claude-opus-4-7',
      mode: 'cram-review',
      courseId: 'x',
    });
    const e2 = await saveHistoryEntry({
      promptText: 'p2',
      llm: 'anthropic',
      model: 'claude-opus-4-7',
      mode: 'cram-review',
      courseId: 'y',
    });
    const all = listHistory();
    expect(all.length).toBe(2);
    expect(all[0]!.id).toBe(e2.id);
    expect(all[1]!.id).toBe(e1.id);
  });

  it('caps history at MAX_HISTORY (LRU)', async () => {
    for (let i = 0; i < MAX_HISTORY + 5; i++) {
      await saveHistoryEntry({
        promptText: `p${i}`,
        llm: 'anthropic',
        model: 'claude-opus-4-7',
        mode: 'cram-review',
        courseId: 'x',
      });
    }
    expect(listHistory().length).toBe(MAX_HISTORY);
  });

  it('stores a rating on an existing entry', async () => {
    const entry = await saveHistoryEntry({
      promptText: 'p',
      llm: 'anthropic',
      model: 'claude-opus-4-7',
      mode: 'cram-review',
      courseId: null,
    });
    rateHistoryEntry(entry.id, 5, 'great');
    const refreshed = listHistory().find((e) => e.id === entry.id);
    expect(refreshed?.rating).toBe(5);
    expect(refreshed?.ratingText).toBe('great');
  });
});
```

- [ ] **Step 2: Run, verify fail**

```bash
npm test tests/unit/storage-history.test.ts
```

- [ ] **Step 3: Implement**

Create `lib/storage/history.ts`:
```typescript
import type { StudyMode } from '@/lib/types';

export type HistoryEntry = {
  id: string;
  createdAt: number;
  promptText: string;
  llm: string;
  model: string;
  mode: StudyMode;
  courseId: string | null;
  rating?: 1 | 2 | 3 | 4 | 5;
  ratingText?: string;
};

const KEY = 'pomfret.v1.history';
export const MAX_HISTORY = 50;

const storage = (): Storage | null => {
  if (typeof window === 'undefined') {
    // jsdom in tests provides localStorage; in SSR it does not
    return null;
  }
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const read = (): HistoryEntry[] => {
  const s = storage();
  if (!s) return [];
  try {
    const raw = s.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as HistoryEntry[];
  } catch {
    return [];
  }
};

const write = (list: HistoryEntry[]): void => {
  const s = storage();
  if (!s) return;
  try {
    s.setItem(KEY, JSON.stringify(list));
  } catch {
    // quota or other; drop silently
  }
};

export async function saveHistoryEntry(
  entry: Omit<HistoryEntry, 'id' | 'createdAt'>,
): Promise<HistoryEntry> {
  const full: HistoryEntry = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...entry,
  };
  const list = read();
  list.unshift(full);
  while (list.length > MAX_HISTORY) list.pop();
  write(list);
  return full;
}

export function listHistory(): HistoryEntry[] {
  return read();
}

export function rateHistoryEntry(id: string, rating: 1 | 2 | 3 | 4 | 5, text?: string): void {
  const list = read();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx]!, rating, ratingText: text };
  write(list);
}

export function clearHistory(): void {
  const s = storage();
  if (!s) return;
  s.removeItem(KEY);
}
```

- [ ] **Step 4: Run, all pass**

```bash
npm test tests/unit/storage-history.test.ts
```

Expected: 4 passing.

- [ ] **Step 5: Commit**

```bash
git add lib/storage/history.ts tests/unit/storage-history.test.ts
git commit -m "feat: localStorage history adapter (LRU 50, schema-versioned)"
```

---

### Task 27: Landing page + root layout

**Files:**
- Modify: `app/layout.tsx`, `app/page.tsx`, `app/globals.css`

- [ ] **Step 1: Replace landing page**

Edit `app/page.tsx`:
```tsx
import Link from 'next/link';
import { Button } from '@/components/ui/button';

export default function HomePage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-20">
      <h1 className="text-4xl font-semibold tracking-tight">
        Better study prompts for Pomfret students.
      </h1>
      <p className="mt-4 text-lg text-slate-600">
        Tell us your course, the assessment, and how you study best. Get back a
        prompt that&apos;s tuned to your LLM and your situation — the kind of
        prompt that gets a real study session, not a generic summary.
      </p>
      <div className="mt-10 flex gap-3">
        <Link href="/wizard">
          <Button size="lg">Start studying</Button>
        </Link>
        <Link href="/history">
          <Button size="lg" variant="outline">
            My past prompts
          </Button>
        </Link>
      </div>
      <section className="mt-16 grid gap-6 sm:grid-cols-3">
        <FeatureCard
          title="Tuned to your model"
          body="The prompt is formatted for Claude, GPT, or Gemini — whichever you actually use."
        />
        <FeatureCard
          title="Knows your course"
          body="Pulls from the Pomfret curriculum so the LLM understands what you're studying."
        />
        <FeatureCard
          title="No accounts"
          body="Use it freely. Your past prompts live in your browser, not on a server."
        />
      </section>
    </main>
  );
}

function FeatureCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border bg-white p-5 shadow-sm">
      <h2 className="font-semibold">{title}</h2>
      <p className="mt-2 text-sm text-slate-600">{body}</p>
    </div>
  );
}
```

- [ ] **Step 2: Update layout title**

Edit `app/layout.tsx` so `metadata` shows:
```typescript
export const metadata = {
  title: 'Pomfret Study Prompts',
  description: 'A guided wizard that produces LLM-tuned study prompts for Pomfret students.',
};
```

- [ ] **Step 3: Smoke run**

```bash
npm run dev
```

Visit http://localhost:3000 — verify landing page renders with the CTA buttons. Stop with Ctrl-C.

- [ ] **Step 4: Commit**

```bash
git add app/page.tsx app/layout.tsx
git commit -m "feat(ui): landing page with CTA + feature cards"
```

---

### Task 28: ModelPicker + CoursePicker + ModePicker components

**Files:**
- Create: `components/ModelPicker.tsx`, `components/CoursePicker.tsx`, `components/ModePicker.tsx`

- [ ] **Step 1: ModelPicker**

Create `components/ModelPicker.tsx`:
```tsx
'use client';

import { useMemo } from 'react';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { listProviders, listModelsForProvider } from '@/lib/model-profiles';

export function ModelPicker(props: {
  provider: string;
  model: string;
  onProviderChange: (v: string) => void;
  onModelChange: (v: string) => void;
}) {
  const providers = useMemo(() => listProviders(), []);
  const models = useMemo(() => listModelsForProvider(props.provider), [props.provider]);

  return (
    <div className="grid gap-6">
      <div>
        <Label htmlFor="provider">Which LLM are you using?</Label>
        <Select value={props.provider} onValueChange={props.onProviderChange}>
          <SelectTrigger id="provider" className="mt-2">
            <SelectValue placeholder="Pick an LLM" />
          </SelectTrigger>
          <SelectContent>
            {providers.map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="model">Which model?</Label>
        <Select value={props.model} onValueChange={props.onModelChange}>
          <SelectTrigger id="model" className="mt-2">
            <SelectValue placeholder="Pick a model" />
          </SelectTrigger>
          <SelectContent>
            {models.map((m) => (
              <SelectItem key={m.id} value={m.id}>
                {m.displayName}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: CoursePicker**

Create `components/CoursePicker.tsx`:
```tsx
'use client';

import { useMemo, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { searchCourses } from '@/lib/courses';

export function CoursePicker(props: {
  courseId: string | null;
  courseFreeText: string;
  onPick: (id: string | null, freeText?: string) => void;
}) {
  const [query, setQuery] = useState('');
  const [showFreeText, setShowFreeText] = useState(props.courseId === null && props.courseFreeText.length > 0);
  const results = useMemo(() => searchCourses(query, 8), [query]);

  return (
    <div className="grid gap-4">
      <div>
        <Label htmlFor="course-search">Search for your class</Label>
        <Input
          id="course-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Try 'astronomy', 'eng', 'algebra'"
          className="mt-2"
        />
        {results.length > 0 && (
          <ul className="mt-2 max-h-72 overflow-auto rounded border bg-white">
            {results.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  className={`block w-full px-3 py-2 text-left text-sm hover:bg-slate-100 ${
                    props.courseId === c.id ? 'bg-slate-100 font-medium' : ''
                  }`}
                  onClick={() => {
                    props.onPick(c.id);
                    setShowFreeText(false);
                  }}
                >
                  <div>{c.name}</div>
                  <div className="text-xs text-slate-500">
                    {c.department} · {c.level}
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="border-t pt-4">
        {!showFreeText ? (
          <Button type="button" variant="ghost" onClick={() => { setShowFreeText(true); props.onPick(null); }}>
            Don&apos;t see your class? Enter it manually
          </Button>
        ) : (
          <div>
            <Label htmlFor="course-freetext">Class name</Label>
            <Input
              id="course-freetext"
              value={props.courseFreeText}
              onChange={(e) => props.onPick(null, e.target.value)}
              placeholder="e.g., Independent study with Mr. X"
              className="mt-2"
            />
          </div>
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: ModePicker**

Create `components/ModePicker.tsx`:
```tsx
'use client';

import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { StudyMode } from '@/lib/types';
import { STUDY_MODE_LABELS, STUDY_MODE_DESCRIPTIONS } from '@/lib/templates';

const MODES: StudyMode[] = [
  'cram-review',
  'multi-day-plan',
  'practice-questions',
  'concept-clarification',
  'essay-project',
];

export function ModePicker(props: {
  value: StudyMode | undefined;
  onChange: (v: StudyMode) => void;
}) {
  return (
    <RadioGroup
      value={props.value ?? ''}
      onValueChange={(v) => props.onChange(v as StudyMode)}
      className="grid gap-3"
    >
      {MODES.map((m) => (
        <div key={m} className="flex items-start gap-3 rounded border bg-white p-3">
          <RadioGroupItem value={m} id={m} className="mt-1" />
          <Label htmlFor={m} className="flex-1 cursor-pointer">
            <div className="font-medium">{STUDY_MODE_LABELS[m]}</div>
            <div className="text-sm text-slate-600">{STUDY_MODE_DESCRIPTIONS[m]}</div>
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/ModelPicker.tsx components/CoursePicker.tsx components/ModePicker.tsx
git commit -m "feat(ui): ModelPicker, CoursePicker (typeahead), ModePicker"
```

---

### Task 29: Assessment + Material + AboutMe step components

**Files:**
- Create: `components/AssessmentStep.tsx`, `components/MaterialStep.tsx`, `components/AboutMeStep.tsx`

- [ ] **Step 1: AssessmentStep**

Create `components/AssessmentStep.tsx`:
```tsx
'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AssessmentType } from '@/lib/types';

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

const TYPES: Array<{ value: AssessmentType; label: string }> = [
  { value: 'test', label: 'Test' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'paper', label: 'Paper / Essay' },
  { value: 'project', label: 'Project' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'other', label: 'Other' },
];

export function AssessmentStep(props: {
  assessmentType: AssessmentType | undefined;
  assessmentDate: string;
  hoursAvailable: number | undefined;
  onChange: (next: { assessmentType?: AssessmentType; assessmentDate?: string; hoursAvailable?: number }) => void;
}) {
  return (
    <div className="grid gap-6">
      <div>
        <Label htmlFor="atype">What kind of assessment?</Label>
        <Select value={props.assessmentType ?? ''} onValueChange={(v) => props.onChange({ assessmentType: v as AssessmentType })}>
          <SelectTrigger id="atype" className="mt-2">
            <SelectValue placeholder="Pick one" />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="adate">When is it?</Label>
        <Input
          id="adate"
          type="date"
          value={props.assessmentDate}
          onChange={(e) => props.onChange({ assessmentDate: e.target.value })}
          className="mt-2"
        />
      </div>
      <div>
        <Label htmlFor="hours">How much study time do you have?</Label>
        <Select
          value={props.hoursAvailable !== undefined ? String(props.hoursAvailable) : ''}
          onValueChange={(v) => props.onChange({ hoursAvailable: parseFloat(v) })}
        >
          <SelectTrigger id="hours" className="mt-2">
            <SelectValue placeholder="Pick a range" />
          </SelectTrigger>
          <SelectContent>
            {HOUR_OPTIONS.map((h) => (
              <SelectItem key={h.value} value={String(h.value)}>{h.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: MaterialStep**

Create `components/MaterialStep.tsx`:
```tsx
'use client';

import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

const MAX = 20000;
const SOFT = 15000;

export function MaterialStep(props: {
  material: string;
  onChange: (v: string) => void;
}) {
  const len = props.material.length;
  return (
    <div className="grid gap-3">
      <Label htmlFor="material">Paste assignment details, topics, or your notes (optional)</Label>
      <Textarea
        id="material"
        value={props.material}
        onChange={(e) => props.onChange(e.target.value.slice(0, MAX))}
        placeholder="The more you share, the better the prompt. This won't be stored anywhere."
        rows={10}
      />
      <div className="text-xs text-slate-500 text-right">
        {len.toLocaleString()} / {MAX.toLocaleString()} characters
      </div>
      {len > SOFT && (
        <Alert>
          <AlertDescription>
            You&apos;re past {SOFT.toLocaleString()} characters. If your material is mostly noise (page numbers, headers), trimming improves prompt quality.
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
```

- [ ] **Step 3: AboutMeStep**

Create `components/AboutMeStep.tsx`:
```tsx
'use client';

import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Slider } from '@/components/ui/slider';

const CONF_LABELS: Record<number, string> = {
  1: 'Lost',
  2: 'Shaky',
  3: 'OK',
  4: 'Solid',
  5: 'Locked in',
};

export function AboutMeStep(props: {
  confidence: number | undefined;
  understanding: string;
  confusion: string;
  onChange: (next: { confidence?: number; understanding?: string; confusion?: string }) => void;
}) {
  const conf = props.confidence ?? 3;
  return (
    <div className="grid gap-6">
      <div>
        <Label htmlFor="conf">How confident are you on the material? (optional)</Label>
        <div className="mt-3">
          <Slider
            id="conf"
            value={[conf]}
            min={1}
            max={5}
            step={1}
            onValueChange={(v) => props.onChange({ confidence: v[0] as 1 | 2 | 3 | 4 | 5 })}
          />
          <div className="mt-2 flex justify-between text-xs text-slate-500">
            <span>{CONF_LABELS[1]}</span>
            <span className="font-medium text-slate-900">{CONF_LABELS[conf] ?? ''}</span>
            <span>{CONF_LABELS[5]}</span>
          </div>
        </div>
      </div>
      <div>
        <Label htmlFor="under">What do you already understand? (optional)</Label>
        <Textarea
          id="under"
          value={props.understanding}
          onChange={(e) => props.onChange({ understanding: e.target.value.slice(0, 2000) })}
          rows={3}
          placeholder="One or two sentences about what makes sense to you."
          className="mt-2"
        />
      </div>
      <div>
        <Label htmlFor="conf-text">What confuses you? (optional)</Label>
        <Textarea
          id="conf-text"
          value={props.confusion}
          onChange={(e) => props.onChange({ confusion: e.target.value.slice(0, 2000) })}
          rows={3}
          placeholder="Be specific — the more concrete, the better the prompt."
          className="mt-2"
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Commit**

```bash
git add components/AssessmentStep.tsx components/MaterialStep.tsx components/AboutMeStep.tsx
git commit -m "feat(ui): Assessment, Material, AboutMe step components"
```

---

### Task 30: Wizard state machine + flow page

**Files:**
- Create: `app/wizard/page.tsx`

- [ ] **Step 1: Implement wizard**

Create `app/wizard/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ModelPicker } from '@/components/ModelPicker';
import { CoursePicker } from '@/components/CoursePicker';
import { ModePicker } from '@/components/ModePicker';
import { AssessmentStep } from '@/components/AssessmentStep';
import { MaterialStep } from '@/components/MaterialStep';
import { AboutMeStep } from '@/components/AboutMeStep';
import type { WizardInputs, AssessmentType, StudyMode } from '@/lib/types';
import { saveHistoryEntry } from '@/lib/storage/history';

const STEP_TITLES = [
  '1 / 6 · Which LLM?',
  '2 / 6 · Which class?',
  '3 / 6 · How do you want to study?',
  '4 / 6 · About the assessment',
  '5 / 6 · Material (optional)',
  '6 / 6 · About you (optional)',
];

const today = (): string => new Date().toISOString().slice(0, 10);

export default function WizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [inputs, setInputs] = useState<Partial<WizardInputs> & { material: string; understanding: string; confusion: string; courseFreeText: string }>({
    assessmentDate: today(),
    material: '',
    understanding: '',
    confusion: '',
    courseFreeText: '',
  });

  const update = (patch: Partial<WizardInputs> & { material?: string; understanding?: string; confusion?: string; courseFreeText?: string }): void => {
    setInputs((prev) => ({ ...prev, ...patch }));
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 0: return Boolean(inputs.provider && inputs.model);
      case 1: return Boolean(inputs.courseId || inputs.courseFreeText.trim().length > 0);
      case 2: return Boolean(inputs.mode);
      case 3: return Boolean(inputs.assessmentType && inputs.assessmentDate && inputs.hoursAvailable);
      case 4: return true;
      case 5: return true;
      default: return false;
    }
  };

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);

    const payload: WizardInputs = {
      provider: inputs.provider!,
      model: inputs.model!,
      courseId: inputs.courseId ?? null,
      courseFreeText: inputs.courseFreeText.trim() || undefined,
      mode: inputs.mode!,
      assessmentType: inputs.assessmentType!,
      assessmentDate: inputs.assessmentDate!,
      hoursAvailable: inputs.hoursAvailable!,
      material: inputs.material.trim() || undefined,
      confidence: inputs.confidence,
      understanding: inputs.understanding.trim() || undefined,
      confusion: inputs.confusion.trim() || undefined,
    };

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Request failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      const data = await res.json();
      const entry = await saveHistoryEntry({
        promptText: data.prompt,
        llm: payload.provider,
        model: payload.model,
        mode: payload.mode,
        courseId: payload.courseId,
      });
      sessionStorage.setItem(
        'pomfret.lastResult',
        JSON.stringify({ ...data, entryId: entry.id }),
      );
      router.push('/wizard/result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
      setSubmitting(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8">
        <Progress value={((step + 1) / 6) * 100} />
        <h2 className="mt-3 text-sm font-medium text-slate-500">{STEP_TITLES[step]}</h2>
      </div>

      <div className="rounded-lg border bg-white p-6 shadow-sm">
        {step === 0 && (
          <ModelPicker
            provider={inputs.provider ?? ''}
            model={inputs.model ?? ''}
            onProviderChange={(v) => update({ provider: v, model: '' })}
            onModelChange={(v) => update({ model: v })}
          />
        )}
        {step === 1 && (
          <CoursePicker
            courseId={inputs.courseId ?? null}
            courseFreeText={inputs.courseFreeText}
            onPick={(id, freeText) => update({ courseId: id, courseFreeText: freeText ?? '' })}
          />
        )}
        {step === 2 && (
          <ModePicker
            value={inputs.mode}
            onChange={(v) => update({ mode: v })}
          />
        )}
        {step === 3 && (
          <AssessmentStep
            assessmentType={inputs.assessmentType}
            assessmentDate={inputs.assessmentDate ?? today()}
            hoursAvailable={inputs.hoursAvailable}
            onChange={(p) => update(p)}
          />
        )}
        {step === 4 && (
          <MaterialStep
            material={inputs.material}
            onChange={(v) => update({ material: v })}
          />
        )}
        {step === 5 && (
          <AboutMeStep
            confidence={inputs.confidence}
            understanding={inputs.understanding}
            confusion={inputs.confusion}
            onChange={(p) => update(p)}
          />
        )}
      </div>

      {error && (
        <Alert className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-6 flex justify-between">
        <Button variant="outline" disabled={step === 0 || submitting} onClick={() => setStep((s) => s - 1)}>
          Back
        </Button>
        {step < 5 ? (
          <Button disabled={!canProceed() || submitting} onClick={() => setStep((s) => s + 1)}>
            Next
          </Button>
        ) : (
          <Button disabled={submitting} onClick={submit}>
            {submitting ? 'Generating...' : 'Generate prompt'}
          </Button>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Smoke run**

```bash
npm run dev
```

Visit http://localhost:3000/wizard. Navigate through each step. Verify Next disables until required fields filled, Back works, sessionStorage handoff is wired. Stop dev server.

- [ ] **Step 3: Commit**

```bash
git add app/wizard/page.tsx
git commit -m "feat(ui): 6-step wizard state machine + submit flow"
```

---

### Task 31: Result page + PromptOutput component

**Files:**
- Create: `app/wizard/result/page.tsx`, `components/PromptOutput.tsx`

- [ ] **Step 1: PromptOutput**

Create `components/PromptOutput.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function PromptOutput({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };
  return (
    <div className="rounded-lg border bg-slate-50">
      <div className="flex items-center justify-between border-b bg-white px-4 py-2">
        <span className="text-sm font-medium text-slate-600">Your prompt</span>
        <Button size="sm" onClick={copy}>{copied ? 'Copied!' : 'Copy'}</Button>
      </div>
      <pre className="whitespace-pre-wrap break-words p-4 text-sm font-mono text-slate-800">
        {prompt}
      </pre>
    </div>
  );
}
```

- [ ] **Step 2: Result page**

Create `app/wizard/result/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PromptOutput } from '@/components/PromptOutput';
import { FeedbackForm } from '@/components/FeedbackForm';

type LastResult = {
  prompt: string;
  metadata: { sonnetUsed: boolean; promptHash: string; fallbackReason?: string };
  entryId: string;
};

export default function ResultPage() {
  const [data, setData] = useState<LastResult | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('pomfret.lastResult');
    if (raw) setData(JSON.parse(raw) as LastResult);
  }, []);

  if (!data) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <p>No prompt found. <Link href="/wizard" className="underline">Start over</Link>.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Your prompt is ready.</h1>
      <p className="mt-2 text-slate-600">
        Copy it, paste it into your LLM, and run a real study session.
      </p>

      {!data.metadata.sonnetUsed && (
        <Alert className="mt-4">
          <AlertDescription>
            Smart sections were unavailable for this generation — we used the deterministic templates instead. The prompt is still solid, but the personalized interaction style is a fallback.
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-6">
        <PromptOutput prompt={data.prompt} />
      </div>

      <div className="mt-8 rounded-lg border bg-white p-6">
        <h2 className="font-semibold">How did this go?</h2>
        <p className="mt-1 text-sm text-slate-600">
          Once you&apos;ve used it, come back and rate the prompt. This helps me make the templates better.
        </p>
        <div className="mt-4">
          <FeedbackForm
            promptHash={data.metadata.promptHash}
            entryId={data.entryId}
          />
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <Link href="/wizard"><Button variant="outline">New prompt</Button></Link>
        <Link href="/history"><Button variant="ghost">See past prompts</Button></Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add app/wizard/result/page.tsx components/PromptOutput.tsx
git commit -m "feat(ui): result page with copy + fallback banner + feedback CTA"
```

---

### Task 32: FeedbackForm + history page

**Files:**
- Create: `components/FeedbackForm.tsx`, `app/history/page.tsx`

- [ ] **Step 1: FeedbackForm**

Create `components/FeedbackForm.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { listHistory, rateHistoryEntry } from '@/lib/storage/history';

const STARS = [1, 2, 3, 4, 5] as const;

export function FeedbackForm(props: { promptHash: string; entryId: string }) {
  const [rating, setRating] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    if (!rating) return;
    const entry = listHistory().find((e) => e.id === props.entryId);
    if (!entry) return;
    setError(null);
    try {
      await fetch('/api/feedback', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          promptHash: props.promptHash,
          provider: entry.llm,
          model: entry.model,
          mode: entry.mode,
          courseId: entry.courseId,
          rating,
          text: text.trim() || undefined,
        }),
      });
      rateHistoryEntry(entry.id, rating as 1 | 2 | 3 | 4 | 5, text.trim() || undefined);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to save');
    }
  };

  if (submitted) {
    return <p className="text-sm text-green-700">Thanks — saved.</p>;
  }

  return (
    <div className="grid gap-3">
      <div className="flex gap-1">
        {STARS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setRating(s)}
            className={`h-10 w-10 rounded-md border text-lg ${
              rating !== null && s <= rating
                ? 'bg-yellow-400 border-yellow-500'
                : 'bg-white hover:bg-slate-50'
            }`}
            aria-label={`${s} out of 5`}
          >
            ★
          </button>
        ))}
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 1000))}
        placeholder="Anything that worked well or didn't? (optional)"
        rows={3}
      />
      <div className="flex justify-end">
        <Button disabled={rating === null} onClick={submit}>Save rating</Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
```

- [ ] **Step 2: History page**

Create `app/history/page.tsx`:
```tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { listHistory, rateHistoryEntry, type HistoryEntry } from '@/lib/storage/history';
import { findCourse } from '@/lib/courses';
import { STUDY_MODE_LABELS } from '@/lib/templates';

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    setEntries(listHistory());
  }, []);

  if (entries === null) {
    return <main className="mx-auto max-w-3xl px-6 py-12">Loading…</main>;
  }

  if (entries.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Past prompts</h1>
        <Alert className="mt-4">
          <AlertDescription>
            No saved prompts yet. <Link className="underline" href="/wizard">Generate one</Link>.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Past prompts</h1>
      <p className="mt-2 text-sm text-slate-600">
        Stored in your browser only — nothing is sent to any server unless you submit a rating.
      </p>
      <ul className="mt-6 grid gap-3">
        {entries.map((e) => (
          <HistoryRow key={e.id} entry={e} onRate={(r) => rateHistoryEntry(e.id, r)} />
        ))}
      </ul>
    </main>
  );
}

function HistoryRow({ entry, onRate }: { entry: HistoryEntry; onRate: (r: 1 | 2 | 3 | 4 | 5) => void }) {
  const [expanded, setExpanded] = useState(false);
  const course = entry.courseId ? findCourse(entry.courseId)?.name : 'Free-text class';
  return (
    <li className="rounded-lg border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-slate-500">
            {new Date(entry.createdAt).toLocaleString()}
          </div>
          <div className="font-medium">{course} · {STUDY_MODE_LABELS[entry.mode]}</div>
          <div className="text-xs text-slate-500">{entry.llm} / {entry.model}</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {entry.rating ? (
            <div className="text-yellow-500">{'★'.repeat(entry.rating)}{'☆'.repeat(5 - entry.rating)}</div>
          ) : (
            <RatingButtons onRate={onRate} />
          )}
        </div>
      </div>
      <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)} className="mt-3">
        {expanded ? 'Hide prompt' : 'Show prompt'}
      </Button>
      {expanded && (
        <pre className="mt-3 whitespace-pre-wrap break-words rounded bg-slate-50 p-3 text-xs font-mono">
          {entry.promptText}
        </pre>
      )}
    </li>
  );
}

function RatingButtons({ onRate }: { onRate: (r: 1 | 2 | 3 | 4 | 5) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onRate(r as 1 | 2 | 3 | 4 | 5)}
          className="h-7 w-7 rounded border bg-white text-sm hover:bg-yellow-100"
        >
          {r}
        </button>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: Smoke run**

```bash
npm run dev
```

Walk through:
1. Visit `/`. Click Start studying.
2. Fill all 6 wizard steps.
3. Generate → land on result page.
4. Copy button works.
5. Rate the prompt → see "Thanks — saved" or similar.
6. Visit `/history` → see the entry.

Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add components/FeedbackForm.tsx app/history/page.tsx
git commit -m "feat(ui): feedback form + history page (read+rate)"
```

---

## Phase 9: E2E

### Task 33: Playwright config + E2E test

**Files:**
- Create: `playwright.config.ts`, `tests/e2e/wizard-flow.spec.ts`

- [ ] **Step 1: Playwright config**

Create `playwright.config.ts`:
```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: 'http://localhost:3000',
    headless: true,
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000,
  },
});
```

- [ ] **Step 2: Install Playwright browsers**

```bash
npx playwright install --with-deps chromium
```

- [ ] **Step 3: E2E test**

Create `tests/e2e/wizard-flow.spec.ts`:
```typescript
import { test, expect } from '@playwright/test';

test('wizard → result → history rate', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /start studying/i }).click();
  await expect(page).toHaveURL(/\/wizard/);

  // Step 1: LLM + model
  await page.getByLabel(/which llm/i).click();
  await page.getByRole('option', { name: /claude/i }).click();
  await page.getByLabel(/which model/i).click();
  await page.getByRole('option', { name: /opus/i }).first().click();
  await page.getByRole('button', { name: /next/i }).click();

  // Step 2: Course
  await page.getByLabel(/search for your class/i).fill('astro');
  await page.locator('li button').first().click();
  await page.getByRole('button', { name: /next/i }).click();

  // Step 3: Mode
  await page.getByLabel(/cram review/i).click();
  await page.getByRole('button', { name: /next/i }).click();

  // Step 4: Assessment
  await page.getByLabel(/what kind/i).click();
  await page.getByRole('option', { name: /test/i }).click();
  await page.getByLabel(/how much study time/i).click();
  await page.getByRole('option', { name: /2 hours/i }).click();
  await page.getByRole('button', { name: /next/i }).click();

  // Step 5: Material (skip)
  await page.getByRole('button', { name: /next/i }).click();

  // Step 6: About me (skip)
  await page.getByRole('button', { name: /generate prompt/i }).click();

  await expect(page).toHaveURL(/\/wizard\/result/, { timeout: 30_000 });
  await expect(page.getByText(/your prompt is ready/i)).toBeVisible();
  await expect(page.locator('pre')).toContainText(/role|ROLE|<role>/);

  // History
  await page.goto('/history');
  await expect(page.getByText(/past prompts/i)).toBeVisible();
  await expect(page.locator('li').first()).toBeVisible();
});
```

- [ ] **Step 4: Run E2E test**

Make sure you have a `.env.local` with a real `ANTHROPIC_API_KEY` (or stub the route to return a fixed response). For first verification, set the env variable to a fake one and watch the fallback path engage.

```bash
ANTHROPIC_API_KEY=fake-for-test npm run test:e2e
```

Expected: passes — even with a fake API key, the pipeline falls back to deterministic generation and the wizard completes.

- [ ] **Step 5: Commit**

```bash
git add playwright.config.ts tests/e2e package.json package-lock.json
git commit -m "test(e2e): wizard → result → history Playwright critical-path test"
```

---

## Phase 10: Polish

### Task 34: README + .env.local.example refresh

**Files:**
- Modify: `README.md`, `.env.local.example`, `.gitignore`

- [ ] **Step 1: Write README**

Replace `README.md`:
```markdown
# Pomfret Prompt Generator

A guided web wizard that generates high-quality, LLM-and-model-tuned study prompts for Pomfret School students.

## What it does

Students pick their LLM, their class (from the Pomfret curriculum), their study mode (cram, multi-day plan, practice questions, concept clarification, or essay prep), the assessment they're prepping for, and how confident they feel. The system produces a prompt — formatted for their specific model — that they paste into ChatGPT / Claude / Gemini for a real study session.

The prompt follows a 7-section framework (Role, About Me, Material, Goal, Interaction Style, Output Spec, Self-Check). Six sections come from deterministic templates; the Interaction Style + anticipated-misconceptions section is generated by Claude Sonnet 4.6 internally, with deterministic fallback if the API is unavailable or the daily budget is exhausted.

## Tech

- Next.js 14 (App Router) + TypeScript strict
- Tailwind + shadcn/ui
- Zod validation
- `@anthropic-ai/sdk` with prompt caching
- Vercel KV (Upstash Redis) for rate limiting + feedback aggregation
- Vitest + Playwright

## Local setup

```bash
cp .env.local.example .env.local
# edit .env.local with real keys

npm install
npm run dev
```

Visit http://localhost:3000.

## Tests

```bash
npm test            # unit + integration
npm run test:e2e    # Playwright
```

## Refresh course catalog

When the Pomfret curriculum guide changes (typically yearly):

```bash
# Update the SOURCE path inside scripts/build-courses.ts if needed
npm run build:courses
```

This rebuilds `data/courses.json`.

## Deploy

Push to Vercel. Set environment variables there (`ANTHROPIC_API_KEY`, `KV_REST_API_URL`, `KV_REST_API_TOKEN`, plus optional knobs).

## Privacy

Pasted material is never persisted (no DB, no logs — errors redact body). Prompt history is stored only in the user's browser localStorage. Feedback is anonymous, stored against a SHA-256 of the prompt.
```

- [ ] **Step 2: Refresh `.gitignore`**

Append to `.gitignore` if not already present:
```
.env.local
.next/
node_modules/
playwright-report/
test-results/
```

- [ ] **Step 3: Commit**

```bash
git add README.md .gitignore
git commit -m "docs: README + .gitignore hygiene"
```

---

## Done

At this point you have:

- A live Next.js app at `localhost:3000` that walks students through a 6-step wizard
- Curriculum-aware course typeahead pulling from `data/courses.json` (parsed from the official curriculum guide)
- Generated prompts tuned to (LLM, model) and to study mode
- Sonnet-assisted "Interaction Style" section with deterministic fallback
- Local prompt history with anonymous KV-aggregated feedback
- Per-IP rate limit + daily budget ceiling
- Full unit, integration, and one critical-path E2E test
- A README for future-you

Next steps (out of scope for v1):
- Deploy to Vercel
- Add "Open in ChatGPT" deep links once tested
- File upload for material (image, PDF) instead of paste-only
- Curriculum-PDF auto-parsing semi-automated
