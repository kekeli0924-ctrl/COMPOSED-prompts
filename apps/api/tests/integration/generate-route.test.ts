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
import { withUser } from '../helpers/with-user';
import { db, schema } from '@/lib/db';
import { hashIp } from '@/lib/ip-hash';

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
      templateVersion: 'v1',
    });
    await resetAllTables();
  });

  it('returns 200 with prompt + metadata + generationId', async () => {
    const res = await post(makeApp(), validBody);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.prompt).toBeTruthy();
    expect(body.metadata.generator).toBe('opus');
    expect(body.metadata.templateVersion).toBe('v1');
    expect(body.metadata.promptHash).toMatch(/^[a-f0-9]{64}$/);
    expect(body.metadata.generationId).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('returns 400 on invalid mode', async () => {
    const res = await post(makeApp(), { ...validBody, mode: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('returns 429 with structured { error: rate_limited, scope: ip } for an anonymous request', async () => {
    mockCheckAndRecord.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const res = await post(makeApp(), validBody);
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.error).toBe('rate_limited');
    expect(body.scope).toBe('ip');
  });

  it('returns 429 with scope: user for an authenticated request', async () => {
    const [u] = await db
      .insert(schema.users)
      .values({ email: 'rl@test.com', clerkUserId: 'clerk_rl', displayName: null })
      .returning({ id: schema.users.id });
    mockCheckAndRecord.mockResolvedValueOnce({ allowed: false, remaining: 0 });
    const app = new Hono();
    app.use('*', withUser({ id: u!.id, email: 'rl@test.com', displayName: null }));
    app.route('/', generate);
    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(429);
    const body = await res.json();
    expect(body.scope).toBe('user');
  });

  it('persists generation with redacted material in prompt_text', async () => {
    const res = await post(makeApp(), { ...validBody, material: 'SENSITIVE NOTES' });
    expect(res.status).toBe(200);
    const rows = await db.select().from(schema.generations);
    expect(rows.length).toBe(1);
    expect(rows[0]!.promptText).not.toContain('fake');
    expect(rows[0]!.promptText).toContain('[material redacted');
    const inputs = rows[0]!.inputsJson as Record<string, unknown>;
    expect(inputs.material).toBe('[redacted]');
  });

  it('attaches userId when authenticated', async () => {
    const [u] = await db
      .insert(schema.users)
      .values({ email: 'u@test.com', clerkUserId: 'clerk_u', displayName: null })
      .returning({ id: schema.users.id });

    const app = new Hono();
    app.use('*', withUser({ id: u!.id, email: 'u@test.com', displayName: null }));
    app.route('/', generate);

    const res = await app.request('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
      body: JSON.stringify(validBody),
    });
    expect(res.status).toBe(200);
    const rows = await db.select().from(schema.generations);
    expect(rows[0]!.userId).toBe(u!.id);
  });

  it('keys the rate limit on the IP (limit 20) for anonymous requests', async () => {
    await post(makeApp(), validBody); // header x-forwarded-for: '1.2.3.4'
    expect(mockCheckAndRecord).toHaveBeenCalledWith(`ip:${hashIp('1.2.3.4')}`, {
      limit: 20,
      windowSeconds: 86400,
    });
  });

  it('keys the rate limit on the user (limit 100) when authenticated', async () => {
    const [u] = await db
      .insert(schema.users)
      .values({ email: 'k@test.com', clerkUserId: 'clerk_k', displayName: null })
      .returning({ id: schema.users.id });
    const app = new Hono();
    app.use('*', withUser({ id: u!.id, email: 'k@test.com', displayName: null }));
    app.route('/', generate);
    await app.request('/api/generate', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '1.2.3.4' },
      body: JSON.stringify(validBody),
    });
    expect(mockCheckAndRecord).toHaveBeenCalledWith(`user:${u!.id}`, {
      limit: 100,
      windowSeconds: 86400,
    });
  });
});
