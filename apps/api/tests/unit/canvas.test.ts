import { describe, it, expect, vi, afterEach } from 'vitest';
import { validateToken, fetchUpcoming, CanvasAuthError } from '@/lib/canvas';

const mockFetch = (status: number, body: unknown) =>
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );

afterEach(() => vi.restoreAllMocks());

describe('validateToken', () => {
  it('ok on 200', async () => {
    mockFetch(200, { name: 'Kerun Li' });
    expect(await validateToken('t')).toEqual({ ok: true, name: 'Kerun Li' });
  });
  it('not ok on 401', async () => {
    mockFetch(401, { errors: [] });
    expect((await validateToken('bad')).ok).toBe(false);
  });
});

describe('fetchUpcoming', () => {
  it('normalizes future assignments, sorted, and drops past/non-assignments', async () => {
    const future1 = new Date(Date.now() + 2 * 86400000).toISOString();
    const future2 = new Date(Date.now() + 5 * 86400000).toISOString();
    const past = new Date(Date.now() - 86400000).toISOString();
    mockFetch(200, [
      { type: 'assignment', html_url: 'u2', context_name: 'US History', assignment: { id: 2, name: 'DBQ', due_at: future2 } },
      { type: 'assignment', html_url: 'u1', context_name: 'Biology', assignment: { id: 1, name: 'Cell Test', due_at: future1 } },
      { type: 'assignment', context_name: 'Past', assignment: { id: 9, name: 'Old', due_at: past } },
      { type: 'event', context_name: 'Club', title: 'Meeting' },
    ]);
    const items = await fetchUpcoming('t');
    expect(items.map((i) => i.id)).toEqual(['1', '2']);
    expect(items[0]).toMatchObject({ title: 'Cell Test', course: 'Biology', dueDate: future1, url: 'u1' });
  });
  it('throws CanvasAuthError on 401', async () => {
    mockFetch(401, {});
    await expect(fetchUpcoming('expired')).rejects.toBeInstanceOf(CanvasAuthError);
  });
});
