import { describe, it, expect, vi, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { resetAllTables } from '../setup';

const { mockRunPipeline, mockCheckAndRecord } = vi.hoisted(() => ({
  mockRunPipeline: vi.fn(),
  mockCheckAndRecord: vi.fn(),
}));

vi.mock('@/lib/pipeline', () => ({ runPipeline: mockRunPipeline }));
vi.mock('@/lib/rate-limit', () => ({ checkAndRecord: mockCheckAndRecord }));

import { generate } from '@/routes/generate';
import { sessionMiddleware } from '@/middleware/session';
import { auth as authRoutes } from '@/routes/auth';

const validBody = {
  provider: 'anthropic',
  model: 'claude-opus-4-7',
  courseId: 'science-astronomy-ii',
  mode: 'cram-review',
  assessmentType: 'test',
  assessmentDate: '2026-06-15',
  hoursAvailable: 4,
};

const makeApp = (): Hono => {
  const app = new Hono();
  app.route('/', generate);
  return app;
};

const post = async (app: Hono, body: unknown, headers: Record<string, string> = {}): Promise<Response> => {
  return app.request('/api/generate', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', ...headers },
    body: JSON.stringify(body),
  });
};

describe('POST /api/generate', () => {
  beforeEach(async () => {
    mockRunPipeline.mockReset();
    mockCheckAndRecord.mockReset();
    mockCheckAndRecord.mockResolvedValue({ allowed: true, remaining: 19 });
    mockRunPipeline.mockResolvedValue({
      prompt: 'test prompt with <material>fake</material> inside',
      promptHash: 'a'.repeat(64),
      generator: 'opus',
    });
    await resetAllTables();
  });

  it('returns 200 with prompt + metadata + generationId', async () => {
    const res = await post(makeApp(), validBody);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prompt).toBeTruthy();
    expect(body.metadata.generator).toBe('opus');
    expect(body.metadata.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.metadata.generationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns 400 on invalid mode', async () => {
    const res = await post(makeApp(), { ...validBody, mode: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('returns 429 when rate limited', async () => {
    mockCheckAndRecord.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const res = await post(makeApp(), validBody);
    expect(res.status).toBe(429);
  });

  it('persists generation with redacted material in prompt_text', async () => {
    const res = await post(makeApp(), { ...validBody, material: 'SENSITIVE NOTES' });
    expect(res.status).toBe(200);
    const { db, schema } = await import('@/lib/db');
    const rows = await db.select().from(schema.generations);
    expect(rows.length).toBe(1);
    expect(rows[0]!.promptText).not.toContain('fake');
    expect(rows[0]!.promptText).toContain('[material redacted');
    const inputs = rows[0]!.inputsJson as Record<string, unknown>;
    expect(inputs.material).toBe('[redacted]');
  });

  it('attaches userId when session present', async () => {
    // Setup: signup to get a session
    const setupApp = (() => {
      const a = new Hono();
      a.use('*', sessionMiddleware);
      a.route('/', authRoutes);
      a.route('/', generate);
      return a;
    })();
    const signup = await setupApp.request('/api/auth/signup', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'u@test.com', password: 'longenough123' }),
    });
    const cookie = signup.headers.get('set-cookie')!.split(';')[0]!;

    const res = await setupApp.request('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4', cookie },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(200);
    const { db, schema } = await import('@/lib/db');
    const rows = await db.select().from(schema.generations);
    expect(rows[0]!.userId).not.toBeNull();
  });
});
