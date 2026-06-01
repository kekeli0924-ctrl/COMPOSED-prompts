import { describe, it, expect, vi, afterEach } from 'vitest';
import { validateToken, fetchUpcoming, CanvasAuthError } from '@/lib/canvas';

const mockFetch = (status: number, body: unknown) =>
  vi.spyOn(global, 'fetch').mockResolvedValue(
    new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }),
  );

// Route responses by request URL (fetchUpcoming makes a courses call then per-course assignment calls).
const mockByUrl = (handler: (url: string) => { status: number; body: unknown }) =>
  vi.spyOn(global, 'fetch').mockImplementation(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    const { status, body } = handler(url);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  });

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
  it('gathers upcoming assignments across active courses, sorted by due date', async () => {
    const future1 = new Date(Date.now() + 2 * 86400000).toISOString();
    const future2 = new Date(Date.now() + 5 * 86400000).toISOString();
    mockByUrl((url) => {
      if (url.includes('/users/self/courses')) return { status: 200, body: [{ id: 11, name: 'Biology' }, { id: 22, name: 'US History' }] };
      if (url.includes('/courses/11/assignments')) return { status: 200, body: [{ id: 1, name: 'Cell Test', due_at: future1, html_url: 'u1' }] };
      if (url.includes('/courses/22/assignments')) return { status: 200, body: [{ id: 2, name: 'DBQ', due_at: future2, html_url: 'u2' }] };
      return { status: 200, body: [] };
    });
    const items = await fetchUpcoming('t');
    expect(items.map((i) => i.id)).toEqual(['1', '2']); // sorted by due date asc
    expect(items[0]).toMatchObject({ title: 'Cell Test', course: 'Biology', dueDate: future1, url: 'u1' });
  });

  it('drops past assignments and skips courses it cannot read (403)', async () => {
    const future = new Date(Date.now() + 3 * 86400000).toISOString();
    const past = new Date(Date.now() - 86400000).toISOString();
    mockByUrl((url) => {
      if (url.includes('/users/self/courses')) return { status: 200, body: [{ id: 11, name: 'Bio' }, { id: 33, name: 'NoAccess' }] };
      if (url.includes('/courses/11/assignments')) return { status: 200, body: [{ id: 1, name: 'Future', due_at: future, html_url: null }, { id: 9, name: 'Past', due_at: past }] };
      if (url.includes('/courses/33/assignments')) return { status: 403, body: { errors: [] } };
      return { status: 200, body: [] };
    });
    const items = await fetchUpcoming('t');
    expect(items.map((i) => i.id)).toEqual(['1']); // past dropped, inaccessible course skipped
  });

  it('throws CanvasAuthError when the courses call 401s', async () => {
    mockByUrl(() => ({ status: 401, body: {} }));
    await expect(fetchUpcoming('expired')).rejects.toBeInstanceOf(CanvasAuthError);
  });
});
