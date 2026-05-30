import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Hono } from 'hono';
import { withUser, type TestUser } from '../helpers/with-user';

// vi.mock is hoisted above imports; vi.hoisted lets the factories reference these.
const { mockGetToken, mockFetchBusy, CalendarAuthError } = vi.hoisted(() => {
  class CalendarAuthError extends Error {}
  return { mockGetToken: vi.fn(), mockFetchBusy: vi.fn(), CalendarAuthError };
});

vi.mock('@/lib/clerk', () => ({
  clerkClient: { users: { getUserOauthAccessToken: mockGetToken } },
}));
vi.mock('@/lib/google-calendar', () => ({
  fetchBusyIntervals: mockFetchBusy,
  CalendarAuthError,
}));

import { calendar } from '@/routes/calendar';

const USER: TestUser = { id: 'u1', email: 'e@test.com', displayName: null, gradYear: null, clerkUserId: 'clerk_1' };
const appFor = (user: TestUser) => {
  const a = new Hono();
  a.use('*', withUser(user));
  a.route('/', calendar);
  return a;
};

describe('GET /api/calendar/freebusy', () => {
  beforeEach(() => {
    mockGetToken.mockReset();
    mockFetchBusy.mockReset();
  });

  it('401 when anonymous', async () => {
    const res = await appFor(null).request('/api/calendar/freebusy');
    expect(res.status).toBe(401);
  });

  it('returns connected:false when Clerk has no Google token', async () => {
    mockGetToken.mockResolvedValue({ data: [] });
    const res = await appFor(USER).request('/api/calendar/freebusy');
    expect(await res.json()).toEqual({ connected: false });
  });

  it('returns free blocks computed from busy', async () => {
    mockGetToken.mockResolvedValue({ data: [{ token: 'ya29' }] });
    mockFetchBusy.mockResolvedValue([]); // no busy -> one full-window free block
    const res = await appFor(USER).request('/api/calendar/freebusy?days=1');
    const body = await res.json();
    expect(body.connected).toBe(true);
    expect(body.freeBlocks.length).toBe(1);
    // Token vended for THIS user via the 'google' provider (guards IDOR + the
    // version-sensitive provider string), then forwarded to Google.
    expect(mockGetToken).toHaveBeenCalledWith('clerk_1', 'google');
    expect(mockFetchBusy).toHaveBeenCalledWith('ya29', expect.any(String), expect.any(String));
  });

  it('returns connected:false on a calendar auth error', async () => {
    mockGetToken.mockResolvedValue({ data: [{ token: 'ya29' }] });
    mockFetchBusy.mockRejectedValue(new CalendarAuthError('scope missing'));
    const res = await appFor(USER).request('/api/calendar/freebusy');
    expect(await res.json()).toEqual({ connected: false });
  });

  it('returns 502 on an unexpected calendar failure (does NOT fake connected)', async () => {
    mockGetToken.mockResolvedValue({ data: [{ token: 'ya29' }] });
    mockFetchBusy.mockRejectedValue(new Error('google freebusy failed 500'));
    const res = await appFor(USER).request('/api/calendar/freebusy');
    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: 'calendar unavailable' });
  });

  it('returns connected:false when the Clerk token fetch itself throws', async () => {
    mockGetToken.mockRejectedValue(new Error('clerk down'));
    const res = await appFor(USER).request('/api/calendar/freebusy');
    expect(await res.json()).toEqual({ connected: false });
  });
});
