import { Hono } from 'hono';
import { computeFreeBlocks, type CalendarFreeBusyResponse } from '@composed-prompts/shared';
import { clerkClient } from '../lib/clerk.js';
import { fetchBusyIntervals, CalendarAuthError } from '../lib/google-calendar.js';

export const calendar = new Hono();

calendar.get('/api/calendar/freebusy', async (c) => {
  const user = c.get('user');
  if (!user) return c.json({ error: 'unauthorized' }, 401);

  const days = Math.min(Math.max(parseInt(c.req.query('days') ?? '7', 10) || 7, 1), 31);
  const timeMin = new Date().toISOString();
  const timeMax = new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString();

  // Clerk vends the Google OAuth token. The provider string may be 'google' or
  // 'oauth_google' depending on the @clerk/backend version — 'google' is correct
  // for this project's installed version; do not change without checking.
  let googleToken: string | null = null;
  try {
    const res = await clerkClient.users.getUserOauthAccessToken(user.clerkUserId, 'google');
    googleToken = res.data?.[0]?.token ?? null;
  } catch {
    googleToken = null;
  }
  if (!googleToken) return c.json({ connected: false } satisfies CalendarFreeBusyResponse, 200);

  try {
    const busy = await fetchBusyIntervals(googleToken, timeMin, timeMax);
    const freeBlocks = computeFreeBlocks(busy, timeMin, timeMax, 30);
    return c.json({ connected: true, busy, freeBlocks } satisfies CalendarFreeBusyResponse, 200);
  } catch (err) {
    if (err instanceof CalendarAuthError) return c.json({ connected: false } satisfies CalendarFreeBusyResponse, 200);
    console.error('calendar freebusy failed', { message: err instanceof Error ? err.message : String(err) });
    return c.json({ error: 'calendar unavailable' }, 502);
  }
});
