'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useApi } from '@/lib/use-api';
import type { CalendarFreeBusyResponse, Interval } from '@composed-prompts/shared';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.freebusy';

const fmt = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

const btn =
  'mt-2 rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700';

export function CalendarConnect() {
  const { isLoaded, user } = useUser();
  const { apiGet } = useApi();
  const [data, setData] = useState<CalendarFreeBusyResponse | null>(null);

  const google = user?.externalAccounts.find((a) => a.provider === 'google');
  const connected = Boolean(google?.approvedScopes?.includes(CALENDAR_SCOPE));

  useEffect(() => {
    if (!connected) return;
    apiGet<CalendarFreeBusyResponse>('/api/calendar/freebusy')
      .then(setData)
      .catch(() => setData({ connected: false }));
  }, [connected, apiGet]);

  // NOTE: externalAccount.reauthorize returns a verification carrying an external
  // redirect URL. Verify its exact shape against the installed @clerk/nextjs version.
  const onConnect = async (): Promise<void> => {
    if (!google) return;
    const res = await google.reauthorize({
      additionalScopes: [CALENDAR_SCOPE],
      redirectUrl: `${window.location.origin}/account`,
    });
    const url = res.verification?.externalVerificationRedirectURL;
    if (url) window.location.href = url.toString();
  };

  if (!isLoaded) return null;

  return (
    <div>
      <dt className="text-slate-500">Google Calendar</dt>
      <dd className="mt-1">
        {!connected ? (
          <>
            <p className="text-slate-600">
              {google
                ? 'Connect your Google Calendar so Composed can see your open study blocks.'
                : 'Add a Google account (avatar menu, top-right) to connect your calendar.'}
            </p>
            {google && (
              <button type="button" onClick={onConnect} className={btn}>
                Connect Google Calendar
              </button>
            )}
          </>
        ) : data === null ? (
          <span className="text-slate-500">Checking your calendar…</span>
        ) : data.connected === false ? (
          <>
            <p className="text-slate-600">Couldn&apos;t read your calendar — reconnect.</p>
            <button type="button" onClick={onConnect} className={btn}>Reconnect</button>
          </>
        ) : (
          <>
            <p className="font-medium">Google Calendar connected ✓</p>
            {data.freeBlocks.length === 0 ? (
              <p className="mt-1 text-slate-500">No open blocks found in the next 7 days.</p>
            ) : (
              <>
                <p className="mt-1 text-slate-500">Your open blocks over the next 7 days:</p>
                <ul className="mt-1 list-disc pl-5 text-xs text-slate-700">
                  {data.freeBlocks.slice(0, 8).map((b: Interval, i: number) => (
                    <li key={i}>{fmt(b.start)} – {fmt(b.end)}</li>
                  ))}
                </ul>
              </>
            )}
          </>
        )}
      </dd>
    </div>
  );
}
