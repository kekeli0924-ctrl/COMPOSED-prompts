# Sharpen: Multi-Model Prompt Refinement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. **All implementation subagents run on Opus (per user instruction).**

**Goal:** Add an opt-in, signed-in "Sharpen" action on the result page that runs a GPT-5.5-thinking critique → Opus-4.8 revise on the already-generated prompt, returning a better prompt + the critique.

**Architecture:** New OpenAI provider (`openai` SDK) for the critic; a shared `revisePromptWithOpus` (Opus extended-thinking) for the rewrite; an authed `POST /api/generate/sharpen` route reusing the existing budget/rate-limit/global-cap controls; a result-page panel. No schema change.

**Tech Stack:** TypeScript, Hono, Drizzle/Postgres, Anthropic SDK (extended thinking), OpenAI SDK, React 19/Next 14, Vitest.

**Spec:** `docs/superpowers/specs/2026-05-31-sharpen-multi-model-prompt-design.md`

---

## ⚠️ SDK-shape confirmation (do this first, in Tasks 1 & 2)
Before writing the `thinking` (Anthropic) and `reasoning_effort` (OpenAI) calls, **read the installed SDK types** and match them exactly — do NOT guess:
- Anthropic: `apps/api`/`packages/shared` use `@anthropic-ai/sdk` `^0.99.0`. Check `node_modules/@anthropic-ai/sdk` for the `thinking` param on `messages.create` (expected `{ type: 'enabled', budget_tokens: number }`) and the response thinking/text block shape. **`max_tokens` MUST be greater than `budget_tokens`**, and **do not set `temperature`** when thinking is enabled.
- OpenAI: after `npm i openai` in `apps/api`, check the installed version's `chat.completions.create` (or `responses.create`) for `reasoning_effort` (expected enum incl. `'high'`). Use whichever API the installed version documents for `gpt-5-5-thinking`.

## File map
- **Modify** `packages/shared/src/generation/opus-full-prompt.ts` (export `makeClient` + `OPUS_MODEL`); **Create** `packages/shared/src/generation/revise-prompt.ts` + `tests/unit/revise-prompt.test.ts`; **Modify** `packages/shared/src/index.ts`, `src/api-contracts.ts`
- **Modify** `apps/api/package.json` (+`openai`); **Create** `apps/api/src/lib/openai.ts` + `tests/unit/openai.test.ts`
- **Modify** `apps/api/src/lib/pipeline.ts` (export `reserveGlobalOpusSlot`); **Create** `apps/api/src/routes/sharpen.ts` + `tests/integration/sharpen-route.test.ts`; **Modify** `apps/api/src/index.ts`
- **Create** `apps/web/components/SharpenPanel.tsx`; **Modify** `apps/web/app/wizard/result/page.tsx`

**Do NOT run `tsc --noEmit` in `packages/shared`** (known `TS6304`); `apps/api` tsc is fine. DB-backed tests need `DATABASE_URL`.

---

## Task 1: Shared revise function + contract (TDD)

**Files:** Modify `packages/shared/src/generation/opus-full-prompt.ts`, `src/index.ts`, `src/api-contracts.ts`; Create `src/generation/revise-prompt.ts`, `tests/unit/revise-prompt.test.ts`

- [ ] **Step 1: Export the client + model from opus-full-prompt.ts**

In `packages/shared/src/generation/opus-full-prompt.ts`:
- Change `const OPUS_MODEL = 'claude-opus-4-8';` to `export const OPUS_MODEL = 'claude-opus-4-8';`
- Change `function makeClient(): AnthropicLike {` to `export function makeClient(): AnthropicLike {`
- Change `type AnthropicLike = {` to `export type AnthropicLike = {`

- [ ] **Step 2: Write the failing test**

Create `packages/shared/tests/unit/revise-prompt.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { revisePromptWithOpus } from '@composed-prompts/shared/src/generation/revise-prompt.js';
import type { WizardInputs } from '@composed-prompts/shared';

const inputs: WizardInputs = {
  provider: 'anthropic',
  model: 'claude-opus-4-8',
  courseId: 'arts-acting-and-improv',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-01',
  hoursAvailable: 2,
};

const mockCreate = vi.fn();
vi.mock('@anthropic-ai/sdk', () => ({
  default: vi.fn(() => ({ messages: { create: mockCreate } })),
}));

describe('revisePromptWithOpus', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    delete process.env.SHARPEN_OPUS_THINKING_BUDGET;
  });

  it('returns the revised prompt and passes the base prompt + critique + thinking budget', async () => {
    mockCreate.mockResolvedValueOnce({
      content: [{ type: 'text', text: 'IMPROVED <role>...</role>' }],
      usage: { input_tokens: 600, output_tokens: 900 },
    });
    const result = await revisePromptWithOpus('BASE PROMPT', 'CRITIQUE TEXT', inputs);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.prompt).toContain('IMPROVED');
    const call = mockCreate.mock.calls[0]![0];
    expect(call.model).toBe('claude-opus-4-8');
    expect(call.thinking).toEqual({ type: 'enabled', budget_tokens: 8000 });
    expect(call.max_tokens).toBeGreaterThan(8000);
    const userMsg = call.messages[0].content as string;
    expect(userMsg).toContain('BASE PROMPT');
    expect(userMsg).toContain('CRITIQUE TEXT');
  });

  it('honors SHARPEN_OPUS_THINKING_BUDGET', async () => {
    process.env.SHARPEN_OPUS_THINKING_BUDGET = '4000';
    mockCreate.mockResolvedValueOnce({ content: [{ type: 'text', text: 'ok' }], usage: { input_tokens: 1, output_tokens: 1 } });
    await revisePromptWithOpus('b', 'c', inputs);
    expect(mockCreate.mock.calls[0]![0].thinking.budget_tokens).toBe(4000);
  });

  it('returns ok:false on API error', async () => {
    mockCreate.mockRejectedValueOnce(new Error('boom'));
    const result = await revisePromptWithOpus('b', 'c', inputs);
    expect(result.ok).toBe(false);
  });
});
```

- [ ] **Step 3: Run, verify it fails**

Run: `cd packages/shared && npx vitest run tests/unit/revise-prompt.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `packages/shared/src/generation/revise-prompt.ts`:
```typescript
import type { WizardInputs } from '../types.js';
import { getModelProfile } from '../model-profiles.js';
import { makeClient, OPUS_MODEL, type OpusFullPromptResult } from './opus-full-prompt.js';

const REVISE_SYSTEM_PROMPT = `You are a prompt engineer improving a study prompt for a Pomfret School student. You will be given (1) a study prompt you previously wrote, and (2) an external critique of it from another model. Produce an IMPROVED version of the prompt that:
- Fixes the valid, specific points in the critique (ignore vague or wrong ones).
- Keeps the same 7-section Pomfret-Study framework and the SAME output format the student's LLM wants (XML tags / markdown headers / numbered steps — match whatever the original used).
- Stays a clean, copy-paste-ready prompt written in the student's first person.
Output ONLY the improved prompt — no preamble, no "here is", no commentary about the changes.`;

const thinkingBudget = (): number => {
  const n = parseInt(process.env.SHARPEN_OPUS_THINKING_BUDGET ?? '8000', 10);
  return Number.isFinite(n) && n > 0 ? n : 8000;
};

export async function revisePromptWithOpus(
  basePrompt: string,
  critique: string,
  inputs: WizardInputs,
  studentGrade?: string,
): Promise<OpusFullPromptResult> {
  const profile = getModelProfile(inputs.provider, inputs.model);
  const budget = thinkingBudget();
  const userMessage = [
    studentGrade ? `Student's grade: ${studentGrade}.` : '',
    `The student's LLM expects: ${profile.format} format. Keep that format.`,
    '',
    'YOUR ORIGINAL PROMPT:',
    '---',
    basePrompt,
    '---',
    '',
    'EXTERNAL CRITIQUE:',
    '---',
    critique,
    '---',
    '',
    'Now output the improved prompt only.',
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n');

  const client = makeClient();
  try {
    const response = await client.messages.create({
      model: OPUS_MODEL,
      max_tokens: budget + 4000, // must exceed the thinking budget
      thinking: { type: 'enabled', budget_tokens: budget },
      system: REVISE_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
    } as Parameters<typeof client.messages.create>[0]);
    const block = response.content.find((b) => b.type === 'text');
    if (!block || block.type !== 'text' || typeof block.text !== 'string') {
      return { ok: false, error: 'api-error' };
    }
    return {
      ok: true,
      prompt: block.text.trim(),
      usage: { input_tokens: response.usage.input_tokens, output_tokens: response.usage.output_tokens },
    };
  } catch (err) {
    console.error('[revise-prompt] Anthropic call failed', { message: err instanceof Error ? err.message : String(err) });
    return { ok: false, error: 'api-error' };
  }
}
```
(NOTE: confirm `thinking` is accepted by the installed `@anthropic-ai/sdk` create-params type — the `as Parameters<...>[0]` cast keeps it compiling if the local type lags; remove the cast if the type already includes `thinking`.)

- [ ] **Step 5: Add the contract (do NOT barrel-export the revise fn)**

Do **not** add `revisePromptWithOpus` to `packages/shared/src/index.ts` — that barrel is browser-safe and deliberately excludes Node-only modules (the Anthropic SDK). Server code imports it via the deep path (`@composed-prompts/shared/src/generation/revise-prompt.js`), exactly like `generateFullPromptWithOpus`.

In `packages/shared/src/api-contracts.ts` (browser-safe — fine to export), add at the end:
```typescript
// POST /api/generate/sharpen
export type SharpenRequest = { generationId: string; basePrompt: string };
export type SharpenResponse =
  | { ok: true; improvedPrompt: string; critique: string }
  | { ok: false; reason: 'unavailable' | 'critic-failed' | 'revise-failed' };
```

- [ ] **Step 6: Run, verify it passes + commit**

Run: `cd packages/shared && npx vitest run tests/unit/revise-prompt.test.ts`
Expected: PASS (3 tests).
```bash
git add packages/shared/src/generation/opus-full-prompt.ts packages/shared/src/generation/revise-prompt.ts packages/shared/src/api-contracts.ts packages/shared/tests/unit/revise-prompt.test.ts
git commit -m "feat(shared): revisePromptWithOpus (extended-thinking) + Sharpen contract"
```

---

## Task 2: OpenAI critic (TDD)

**Files:** Modify `apps/api/package.json`; Create `apps/api/src/lib/openai.ts`, `apps/api/tests/unit/openai.test.ts`

- [ ] **Step 1: Add the OpenAI SDK**

Run: `cd apps/api && npm install openai`
Expected: `openai` added to `apps/api/package.json` dependencies.

- [ ] **Step 2: Write the failing test**

Create `apps/api/tests/unit/openai.test.ts`:
```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockCreate = vi.fn();
vi.mock('openai', () => ({
  default: vi.fn(() => ({ chat: { completions: { create: mockCreate } } })),
}));

import { critiquePromptWithGpt, CritiqueError } from '@/lib/openai';

const ctx = { courseLabel: 'Biology', mode: 'cram-review', assessmentType: 'test' };

describe('critiquePromptWithGpt', () => {
  beforeEach(() => {
    mockCreate.mockReset();
    delete process.env.SHARPEN_GPT_EFFORT;
  });

  it('returns the critique and sends reasoning_effort=high by default', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'WEAKNESS: too vague' } }] });
    const out = await critiquePromptWithGpt('BASE PROMPT', ctx);
    expect(out).toContain('WEAKNESS');
    const call = mockCreate.mock.calls[0]![0];
    expect(call.model).toBe('gpt-5-5-thinking');
    expect(call.reasoning_effort).toBe('high');
    expect(JSON.stringify(call.messages)).toContain('BASE PROMPT');
  });

  it('honors SHARPEN_GPT_EFFORT', async () => {
    process.env.SHARPEN_GPT_EFFORT = 'medium';
    mockCreate.mockResolvedValueOnce({ choices: [{ message: { content: 'x' } }] });
    await critiquePromptWithGpt('b', ctx);
    expect(mockCreate.mock.calls[0]![0].reasoning_effort).toBe('medium');
  });

  it('throws CritiqueError when the API throws', async () => {
    mockCreate.mockRejectedValueOnce(new Error('429'));
    await expect(critiquePromptWithGpt('b', ctx)).rejects.toBeInstanceOf(CritiqueError);
  });

  it('throws CritiqueError when there is no content', async () => {
    mockCreate.mockResolvedValueOnce({ choices: [{ message: {} }] });
    await expect(critiquePromptWithGpt('b', ctx)).rejects.toBeInstanceOf(CritiqueError);
  });
});
```

- [ ] **Step 3: Run, verify it fails**

Run: `cd apps/api && npx vitest run tests/unit/openai.test.ts`
Expected: FAIL — `@/lib/openai` not found.

- [ ] **Step 4: Implement**

Create `apps/api/src/lib/openai.ts`:
```typescript
import OpenAI from 'openai';

export class CritiqueError extends Error {}

const GPT_MODEL = 'gpt-5-5-thinking';

const effort = (): string => process.env.SHARPEN_GPT_EFFORT ?? 'high';

const CRITIC_SYSTEM = `You are a prompt-engineering critic. You will be shown a study prompt that another AI wrote for a Pomfret School student, plus the student's situation. List concrete, specific weaknesses in the prompt and exactly what would make it sharper — name actual gaps (missing constraints, vague instructions, weak self-test design, format issues), not generic advice. Be terse and specific. Do NOT rewrite the prompt; only critique it.`;

let client: OpenAI | null = null;
function getClient(): OpenAI {
  if (!client) client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  return client;
}

export async function critiquePromptWithGpt(
  basePrompt: string,
  context: { courseLabel: string; mode: string; assessmentType: string },
): Promise<string> {
  const user = [
    `Student situation: ${context.courseLabel}, study mode "${context.mode}", preparing for a ${context.assessmentType}.`,
    '',
    'The prompt to critique:',
    '---',
    basePrompt,
    '---',
  ].join('\n');
  try {
    const res = await getClient().chat.completions.create({
      model: GPT_MODEL,
      reasoning_effort: effort(),
      messages: [
        { role: 'system', content: CRITIC_SYSTEM },
        { role: 'user', content: user },
      ],
    } as Parameters<OpenAI['chat']['completions']['create']>[0]);
    const text = (res as { choices?: Array<{ message?: { content?: string } }> }).choices?.[0]?.message?.content;
    if (!text || typeof text !== 'string') throw new CritiqueError('empty critique');
    return text;
  } catch (err) {
    if (err instanceof CritiqueError) throw err;
    throw new CritiqueError(err instanceof Error ? err.message : String(err));
  }
}
```
(NOTE: confirm `reasoning_effort` + the `gpt-5-5-thinking` model id against the installed `openai` version; if it uses the Responses API instead of `chat.completions`, switch accordingly — the `as Parameters<...>` cast keeps it compiling against the local type.)

- [ ] **Step 5: Run, verify it passes + commit**

Run: `cd apps/api && npx vitest run tests/unit/openai.test.ts`
Expected: PASS (4 tests).
```bash
git add apps/api/package.json apps/api/package-lock.json apps/api/src/lib/openai.ts apps/api/tests/unit/openai.test.ts
git commit -m "feat(api): GPT-5.5-thinking prompt critic (openai)"
```

---

## Task 3: Sharpen route (TDD)

**Files:** Modify `apps/api/src/lib/pipeline.ts`, `apps/api/src/index.ts`; Create `apps/api/src/routes/sharpen.ts`, `apps/api/tests/integration/sharpen-route.test.ts`

- [ ] **Step 1: Export the global-cap reservation**

In `apps/api/src/lib/pipeline.ts`, change `function reserveGlobalOpusSlot(): boolean {` to `export function reserveGlobalOpusSlot(): boolean {`.

- [ ] **Step 2: Write the failing test**

Create `apps/api/tests/integration/sharpen-route.test.ts`:
```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { withUser, type TestUser } from '../helpers/with-user';
import { resetAllTables } from '../setup';
import { db, schema } from '@/lib/db';

const { mockCritique, mockRevise, mockBudget, mockRecord, mockCheck, mockReserve } = vi.hoisted(() => ({
  mockCritique: vi.fn(),
  mockRevise: vi.fn(),
  mockBudget: vi.fn(),
  mockRecord: vi.fn(),
  mockCheck: vi.fn(),
  mockReserve: vi.fn(),
}));

vi.mock('@/lib/openai', () => ({ critiquePromptWithGpt: mockCritique, CritiqueError: class extends Error {} }));
vi.mock('@composed-prompts/shared/src/generation/revise-prompt.js', () => ({ revisePromptWithOpus: mockRevise }));
vi.mock('@/lib/budget', () => ({ budgetAvailable: mockBudget, recordSpend: mockRecord }));
vi.mock('@/lib/rate-limit', () => ({ checkAndRecord: mockCheck }));
vi.mock('@/lib/pipeline', () => ({ reserveGlobalOpusSlot: mockReserve }));

import { sharpen } from '@/routes/sharpen';

const USER: TestUser = { id: 'u1', email: 'e@test.com', displayName: null, clerkUserId: 'c1' };
const appFor = (u: TestUser) => { const a = new Hono(); a.use('*', withUser(u)); a.route('/', sharpen); return a; };
const post = (a: Hono, body: unknown) => a.request('/api/generate/sharpen', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

describe('POST /api/generate/sharpen', () => {
  let genId: string;
  beforeEach(async () => {
    mockCritique.mockReset(); mockRevise.mockReset(); mockBudget.mockReset();
    mockRecord.mockReset(); mockCheck.mockReset(); mockReserve.mockReset();
    mockCheck.mockResolvedValue({ allowed: true, remaining: 9 });
    mockBudget.mockResolvedValue(true);
    mockReserve.mockReturnValue(true);
    mockRecord.mockResolvedValue(undefined);
    mockCritique.mockResolvedValue('CRITIQUE');
    mockRevise.mockResolvedValue({ ok: true, prompt: 'IMPROVED', usage: { input_tokens: 1, output_tokens: 1 } });
    await resetAllTables();
    const [g] = await db.insert(schema.generations).values({
      inputsJson: { provider: 'anthropic', model: 'claude-opus-4-8', courseId: 'science-biology', mode: 'cram-review', assessmentType: 'test', assessmentDate: '2026-06-10', hoursAvailable: 4 },
      promptText: 'BASE', promptHash: 'a'.repeat(64), generator: 'opus', courseId: 'science-biology', mode: 'cram-review', provider: 'anthropic', model: 'claude-opus-4-8',
    }).returning({ id: schema.generations.id });
    genId = g!.id;
  });

  it('401 when anonymous', async () => {
    expect((await post(appFor(null), { generationId: genId, basePrompt: 'BASE' })).status).toBe(401);
  });

  it('400 when basePrompt is too long', async () => {
    const res = await post(appFor(USER), { generationId: genId, basePrompt: 'x'.repeat(20001) });
    expect(res.status).toBe(400);
  });

  it('429 over the per-user cap', async () => {
    mockCheck.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    expect((await post(appFor(USER), { generationId: genId, basePrompt: 'BASE' })).status).toBe(429);
  });

  it('returns ok:false when budget is unavailable (no model calls)', async () => {
    mockBudget.mockResolvedValueOnce(false);
    const res = await post(appFor(USER), { generationId: genId, basePrompt: 'BASE' });
    expect(await res.json()).toEqual({ ok: false, reason: 'unavailable' });
    expect(mockCritique).not.toHaveBeenCalled();
  });

  it('happy path returns improvedPrompt + critique', async () => {
    const res = await post(appFor(USER), { generationId: genId, basePrompt: 'BASE' });
    const body = await res.json();
    expect(body).toEqual({ ok: true, improvedPrompt: 'IMPROVED', critique: 'CRITIQUE' });
    expect(mockRecord).toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: Run, verify it fails**

Run: `cd apps/api && npm test -- tests/integration/sharpen-route.test.ts`
Expected: FAIL — `@/routes/sharpen` not found.

- [ ] **Step 4: Implement the route**

Create `apps/api/src/routes/sharpen.ts`:
```typescript
import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import {
  findCourse,
  gradeFromGradYear,
  redactMaterialForHistory,
  type WizardInputs,
  type SharpenResponse,
} from '@composed-prompts/shared';
// Node-only modules are imported via deep paths (the browser-safe barrel excludes them),
// which also lets the route test mock them — mirrors how pipeline.ts imports these.
import { revisePromptWithOpus } from '@composed-prompts/shared/src/generation/revise-prompt.js';
import { promptHash } from '@composed-prompts/shared/src/storage/prompt-hash.js';
import { critiquePromptWithGpt, CritiqueError } from '../lib/openai.js';
import { budgetAvailable, recordSpend } from '../lib/budget.js';
import { checkAndRecord } from '../lib/rate-limit.js';
import { reserveGlobalOpusSlot } from '../lib/pipeline.js';
import { db, schema } from '../lib/db.js';

export const sharpen = new Hono();

const PER_USER = parseInt(process.env.SHARPEN_PER_USER_PER_DAY ?? '10', 10);
const SPEND = parseFloat(process.env.SHARPEN_SPEND_ESTIMATE_USD ?? '0.20');
const MAX_PROMPT = 20000;

sharpen.post('/api/generate/sharpen', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  let body: { generationId?: unknown; basePrompt?: unknown };
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'invalid JSON' }, 400);
  }
  const generationId = typeof body.generationId === 'string' ? body.generationId : '';
  const basePrompt = typeof body.basePrompt === 'string' ? body.basePrompt : '';
  if (!generationId || !basePrompt) return c.json({ error: 'missing fields' }, 400);
  if (basePrompt.length > MAX_PROMPT) return c.json({ error: 'prompt too long' }, 400);

  const rl = await checkAndRecord(`sharpen:user:${user.id}`, { limit: PER_USER, windowSeconds: 86400 });
  if (!rl.allowed) return c.json({ error: 'daily sharpen limit reached' }, 429);

  // Cost gate: dollar budget (fails closed) + the global Opus slot (revise is an Opus call).
  if (!(await budgetAvailable()) || !reserveGlobalOpusSlot()) {
    return c.json({ ok: false, reason: 'unavailable' } satisfies SharpenResponse, 200);
  }

  const [row] = await db.select().from(schema.generations).where(eq(schema.generations.id, generationId));
  if (!row) return c.json({ ok: false, reason: 'unavailable' } satisfies SharpenResponse, 200);
  const inputs = row.inputsJson as unknown as WizardInputs;
  const courseLabel = (inputs.courseId ? findCourse(inputs.courseId)?.name : inputs.courseFreeText) ?? 'their course';
  const grade = gradeFromGradYear(user.gradYear ?? null) ?? undefined;

  let critique: string;
  try {
    critique = await critiquePromptWithGpt(basePrompt, { courseLabel, mode: inputs.mode, assessmentType: inputs.assessmentType });
  } catch (err) {
    if (err instanceof CritiqueError) return c.json({ ok: false, reason: 'critic-failed' } satisfies SharpenResponse, 200);
    console.error('sharpen critic failed', { message: err instanceof Error ? err.message : String(err) });
    return c.json({ ok: false, reason: 'critic-failed' } satisfies SharpenResponse, 200);
  }

  const revised = await revisePromptWithOpus(basePrompt, critique, inputs, grade);
  if (!revised.ok) return c.json({ ok: false, reason: 'revise-failed' } satisfies SharpenResponse, 200);

  await recordSpend(SPEND);
  await db.insert(schema.generations).values({
    userId: user.id,
    inputsJson: inputs as unknown as Record<string, unknown>, // already redacted (loaded from storage)
    promptText: redactMaterialForHistory(revised.prompt),
    promptHash: promptHash(revised.prompt),
    generator: 'opus',
    courseId: row.courseId,
    mode: row.mode,
    provider: row.provider,
    model: row.model,
  });

  return c.json({ ok: true, improvedPrompt: revised.prompt, critique } satisfies SharpenResponse, 200);
});
```

- [ ] **Step 5: Mount the route**

In `apps/api/src/index.ts`: add `import { sharpen } from './routes/sharpen.js';` after the `generate` import, and `app.route('/', sharpen);` after `app.route('/', generate);`.

- [ ] **Step 6: Run, verify it passes + type-check + commit**

Run: `cd apps/api && npm test -- tests/integration/sharpen-route.test.ts && npx tsc --noEmit`
Expected: PASS (5 tests); tsc clean.
```bash
git add apps/api/src/lib/pipeline.ts apps/api/src/routes/sharpen.ts apps/api/src/index.ts apps/api/tests/integration/sharpen-route.test.ts
git commit -m "feat(api): POST /api/generate/sharpen (signed-in critique->revise, capped)"
```

---

## Task 4: Result-page Sharpen panel

**Files:** Create `apps/web/components/SharpenPanel.tsx`; Modify `apps/web/app/wizard/result/page.tsx`

- [ ] **Step 1: Create the component**

Create `apps/web/components/SharpenPanel.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { SignedIn, SignedOut, SignInButton } from '@clerk/nextjs';
import { useApi } from '@/lib/use-api';
import type { SharpenResponse } from '@composed-prompts/shared';

const btn = 'rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50';

export function SharpenPanel({
  generationId,
  basePrompt,
  onImproved,
}: {
  generationId: string;
  basePrompt: string;
  onImproved: (improved: string) => void;
}) {
  const { apiPost } = useApi();
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [critique, setCritique] = useState<string | null>(null);
  const [showCritique, setShowCritique] = useState(false);

  const sharpen = async (): Promise<void> => {
    setState('loading');
    try {
      const res = await apiPost<SharpenResponse>('/api/generate/sharpen', { generationId, basePrompt });
      if (res.ok) {
        onImproved(res.improvedPrompt);
        setCritique(res.critique);
        setState('done');
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  };

  return (
    <div className="mt-4 rounded-lg border bg-white p-4">
      <SignedOut>
        <p className="text-sm text-slate-600">Want a second frontier model to critique and sharpen this prompt?</p>
        <SignInButton mode="modal">
          <button type="button" className={`${btn} mt-2`}>Sign in to sharpen with a 2nd model</button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        {state === 'idle' && (
          <>
            <p className="text-sm text-slate-600">Have GPT-5.5 critique this prompt and Opus revise it — a sharper version.</p>
            <button type="button" onClick={sharpen} className={`${btn} mt-2`}>Sharpen with a 2nd model</button>
          </>
        )}
        {state === 'loading' && <p className="text-sm text-slate-500">A second model is critiquing &amp; sharpening — about 30 seconds…</p>}
        {state === 'error' && (
          <p className="text-sm text-slate-600">Couldn&apos;t sharpen right now — your prompt above is still solid.</p>
        )}
        {state === 'done' && (
          <div className="text-sm">
            <p className="font-medium text-emerald-700">Sharpened ✓ — the prompt above is the improved version.</p>
            {critique && (
              <>
                <button type="button" onClick={() => setShowCritique((v) => !v)} className="mt-2 text-xs text-indigo-600 underline">
                  {showCritique ? 'Hide' : 'What the 2nd model flagged'}
                </button>
                {showCritique && (
                  <pre className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs text-slate-700">{critique}</pre>
                )}
              </>
            )}
          </div>
        )}
      </SignedIn>
    </div>
  );
}
```

- [ ] **Step 2: Wire it into the result page**

In `apps/web/app/wizard/result/page.tsx`:
- Add the import: `import { SharpenPanel } from '@/components/SharpenPanel';`
- Add state to allow swapping in the improved prompt. Replace `const [showSchedule, setShowSchedule] = useState(false);` with:
```tsx
  const [showSchedule, setShowSchedule] = useState(false);
  const [improvedPrompt, setImprovedPrompt] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);
```
- Change the `<PromptOutput prompt={data.prompt} />` block to show the improved prompt when present:
```tsx
      <div className="mt-6">
        <PromptOutput prompt={improvedPrompt && !showOriginal ? improvedPrompt : data.prompt} />
        {improvedPrompt && (
          <button type="button" onClick={() => setShowOriginal((v) => !v)} className="mt-2 text-xs text-indigo-600 underline">
            {showOriginal ? 'Show sharpened' : 'See original'}
          </button>
        )}
      </div>
      <SharpenPanel
        generationId={data.metadata.generationId}
        basePrompt={data.prompt}
        onImproved={setImprovedPrompt}
      />
```

- [ ] **Step 3: Build + commit**

Run: `cd apps/web && npm run build`
Expected: compiles.
```bash
git add apps/web/components/SharpenPanel.tsx apps/web/app/wizard/result/page.tsx
git commit -m "feat(web): result-page Sharpen panel (2nd-model refine, signed-in)"
```

---

## Task 5: [USER ACTION] OpenAI key

No code. Needed for the live/manual path (the tests mock OpenAI).

- [ ] **Step 1:** Create an OpenAI account + API key.
- [ ] **Step 2:** Set it as a Fly secret on the backend: `fly secrets set OPENAI_API_KEY=sk-...` (and add to `apps/api/.env` for local dev). Optionally set `SHARPEN_PER_USER_PER_DAY`, `SHARPEN_OPUS_THINKING_BUDGET`, `SHARPEN_GPT_EFFORT`, `SHARPEN_SPEND_ESTIMATE_USD`.

---

## Task 6: Full verification

**Files:** none

- [ ] **Step 1: Automated**

```bash
cd packages/shared && npx vitest run                          # incl. revise-prompt
cd apps/api && npx vitest run tests/unit/openai.test.ts tests/integration/sharpen-route.test.ts && npx tsc --noEmit
cd apps/web && npm run build && npx vitest run
```
Expected: all pass; tsc clean; build compiles.

- [ ] **Step 2: Clean tree** — `git status --short` → empty.

- [ ] **Step 3: [MANUAL, after `fly deploy` + the OpenAI secret]** Sign in, generate a prompt, click **Sharpen with a 2nd model**, confirm it returns an improved prompt + the "see original" toggle + the collapsed critique. Signed-out shows the "sign in to sharpen" button.

---

## Notes for the implementer
- **Confirm SDK shapes first** (the ⚠️ box up top) — `thinking` and `reasoning_effort` against the *installed* versions; the `as Parameters<...>` casts are there so a lagging local type still compiles, but verify the runtime params are right.
- **No schema change** — the sharpened row reuses existing `generations` columns; `inputs_json` loaded from storage is already redacted, so reuse it directly.
- **The cost gate reuses what we just hardened** (budget fails closed, the global Opus slot); sharpen is additionally signed-in + per-user-capped.
- Watch for stray untracked files; do NOT create shims.
