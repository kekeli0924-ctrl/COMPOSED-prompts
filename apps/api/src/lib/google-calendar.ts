import type { Interval } from '@composed-prompts/shared';

export class CalendarAuthError extends Error {}

// Reads busy intervals from the user's primary Google Calendar via freeBusy.query.
export async function fetchBusyIntervals(
  googleToken: string,
  timeMin: string,
  timeMax: string,
): Promise<Interval[]> {
  const res = await fetch('https://www.googleapis.com/calendar/v3/freeBusy', {
    method: 'POST',
    headers: { Authorization: `Bearer ${googleToken}`, 'content-type': 'application/json' },
    body: JSON.stringify({ timeMin, timeMax, items: [{ id: 'primary' }] }),
  });
  if (res.status === 401 || res.status === 403) {
    throw new CalendarAuthError(`google freebusy auth error ${res.status}`);
  }
  if (!res.ok) {
    throw new Error(`google freebusy failed ${res.status}`);
  }
  const data = (await res.json()) as {
    calendars?: { primary?: { busy?: Interval[]; errors?: Array<{ domain?: string; reason?: string }> } };
  };
  const primary = data.calendars?.primary;
  // freeBusy can return HTTP 200 with a per-calendar error (e.g. notFound /
  // internalError) and no `busy` array. Treating that as "no busy time" would
  // tell the student they're completely free — surface it as a failure instead
  // (the route maps non-auth errors to 502 → the UI shows "couldn't read").
  if (primary?.errors?.length) {
    throw new Error(`google freebusy primary error: ${primary.errors.map((e) => e.reason ?? 'unknown').join(',')}`);
  }
  return primary?.busy ?? [];
}
