import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { feedback } from '@/routes/feedback';
import { db, schema } from '@/lib/db';
import { resetAllTables } from '../setup';

const makeApp = (): Hono => {
  const app = new Hono();
  app.route('/', feedback);
  return app;
};

const post = (app: Hono, body: unknown): Promise<Response> =>
  app.request('/api/feedback', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });

const seedGeneration = async (): Promise<string> => {
  const [g] = await db
    .insert(schema.generations)
    .values({
      inputsJson: {},
      promptText: 'test',
      promptHash: 'a'.repeat(64),
      generator: 'opus',
      mode: 'cram-review',
      provider: 'anthropic',
      model: 'claude-opus-4-7',
    })
    .returning({ id: schema.generations.id });
  return g!.id;
};

describe('POST /api/feedback', () => {
  beforeEach(async () => {
    await resetAllTables();
  });

  it('accepts a valid feedback payload', async () => {
    const genId = await seedGeneration();
    const res = await post(makeApp(), {
      generationId: genId,
      promptHash: 'a'.repeat(64),
      rating: 4,
    });
    expect(res.status).toBe(200);
    const rows = await db.select().from(schema.feedback);
    expect(rows.length).toBe(1);
    expect(rows[0]!.rating).toBe(4);
  });

  it('rejects rating outside 1-5', async () => {
    const genId = await seedGeneration();
    const res = await post(makeApp(), { generationId: genId, promptHash: 'a'.repeat(64), rating: 99 });
    expect(res.status).toBe(400);
  });

  it('rejects missing generationId', async () => {
    const res = await post(makeApp(), { promptHash: 'a'.repeat(64), rating: 4 });
    expect(res.status).toBe(400);
  });

  it('rejects duplicate feedback for same generation', async () => {
    const genId = await seedGeneration();
    await post(makeApp(), { generationId: genId, promptHash: 'a'.repeat(64), rating: 3 });
    const res2 = await post(makeApp(), { generationId: genId, promptHash: 'a'.repeat(64), rating: 5 });
    expect(res2.status).toBe(409);
  });

  it('returns 404 for unknown generationId', async () => {
    const res = await post(makeApp(), { generationId: '00000000-0000-0000-0000-000000000000', promptHash: 'a'.repeat(64), rating: 4 });
    expect(res.status).toBe(404);
  });
});
