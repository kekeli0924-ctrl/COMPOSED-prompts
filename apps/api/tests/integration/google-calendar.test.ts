import { describe, it, expect, vi, afterEach } from 'vitest';
import { fetchBusyIntervals, CalendarAuthError } from '@/lib/google-calendar';

afterEach(() => vi.restoreAllMocks());

describe('fetchBusyIntervals', () => {
  it('posts to the freeBusy endpoint and parses primary busy', async () => {
    const fetchMock = vi.spyOn(global, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ calendars: { primary: { busy: [{ start: 'a', end: 'b' }] } } }), { status: 200 }),
    );
    const busy = await fetchBusyIntervals('tok', '2026-06-01T00:00:00Z', '2026-06-08T00:00:00Z');
    expect(busy).toEqual([{ start: 'a', end: 'b' }]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/calendar/v3/freeBusy');
    expect((init!.headers as Record<string, string>).Authorization).toBe('Bearer tok');
  });

  it('returns [] when there is no busy array', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response(JSON.stringify({ calendars: {} }), { status: 200 }));
    expect(await fetchBusyIntervals('tok', 'a', 'b')).toEqual([]);
  });

  it('throws CalendarAuthError on 401/403', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('no', { status: 403 }));
    await expect(fetchBusyIntervals('tok', 'a', 'b')).rejects.toBeInstanceOf(CalendarAuthError);
  });

  it('throws a plain Error (not CalendarAuthError) on other non-ok statuses', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue(new Response('boom', { status: 500 }));
    await expect(fetchBusyIntervals('tok', 'a', 'b')).rejects.toThrow('google freebusy failed 500');
  });
});
