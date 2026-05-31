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

// The route persists the redacted sharpened row with userId: user.id into the
// generations.user_id (uuid) column, so the signed-in fixture must use a real
// user row's UUID (mirrors generate-route.test.ts) — a literal like 'u1' would
// fail the uuid insert. Seeded per-test in beforeEach.
let USER: TestUser;
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
    const [u] = await db.insert(schema.users).values({ email: 'e@test.com', clerkUserId: 'c1', displayName: null }).returning({ id: schema.users.id });
    USER = { id: u!.id, email: 'e@test.com', displayName: null, clerkUserId: 'c1' };
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
