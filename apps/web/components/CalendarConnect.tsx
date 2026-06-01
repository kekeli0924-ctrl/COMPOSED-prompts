'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useApi } from '@/lib/use-api';
import { Button } from '@/components/ui/button';
import type { CalendarFreeBusyResponse, Interval } from '@composed-prompts/shared';

const CALENDAR_SCOPE = 'https://www.googleapis.com/auth/calendar.freebusy';

const fmt = (iso: string): string =>
  new Date(iso).toLocaleString(undefined, { weekday: 'short', hour: 'numeric', minute: '2-digit' });

export function CalendarConnect() {
  const { isLoaded, user } = useUser();
  const { apiGet } = useApi();
  const [data, setData] = useState<CalendarFreeBusyResponse | null>(null);

  const google = user?.externalAccounts.find((a) => a.provider === 'google');
  const connected = Boolean(google?.approvedScopes?.includes(CALENDAR_SCOPE));

  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    apiGet<CalendarFreeBusyResponse>('/api/calendar/freebusy')
      .then((d) => {
        if (!cancelled) setData(d);
      })
      .catch(() => {
        if (!cancelled) setData({ connected: false });
      });
    return () => {
      cancelled = true;
    };
  }, [connected, apiGet]);

  // reauthorize returns an ExternalAccountResource whose verification carries the
  // Google consent URL; sending the browser there grants the calendar.freebusy
  // scope and redirects back to /account.
  const onConnect = async (): Promise<void> => {
    if (!google) return;
    try {
      const res = await google.reauthorize({
        additionalScopes: [CALENDAR_SCOPE],
        redirectUrl: `${window.location.origin}/account`,
      });
      const url = res.verification?.externalVerificationRedirectURL;
      if (url) window.location.href = url.toString();
    } catch {
      // Consent dismissed or a transient Clerk error — no-op; the button stays
      // available so the student can try again.
    }
  };

  if (!isLoaded) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <dt className="text-muted-foreground">Google Calendar</dt>
      <dd className="mt-1">
        {!connected ? (
          <>
            <p className="text-muted-foreground">
              {google
                ? 'Connect your Google Calendar so Composed can see your open study blocks.'
                : 'Add a Google account (avatar menu, top-right) to connect your calendar.'}
            </p>
            {google && (
              <Button type="button" onClick={onConnect} size="sm" className="mt-2">
                Connect Google Calendar
              </Button>
            )}
          </>
        ) : data === null ? (
          <span className="text-muted-foreground">Checking your calendar…</span>
        ) : data.connected === false ? (
          <>
            <p className="text-muted-foreground">Couldn&apos;t read your calendar — reconnect.</p>
            <Button type="button" onClick={onConnect} size="sm" className="mt-2">Reconnect</Button>
          </>
        ) : (
          <>
            <p className="font-medium text-foreground">Google Calendar connected ✓</p>
            {data.freeBlocks.length === 0 ? (
              <p className="mt-1 text-muted-foreground">No open blocks found in the next 7 days.</p>
            ) : (
              <>
                <p className="mt-1 text-muted-foreground">Your open blocks over the next 7 days:</p>
                <ul className="mt-1 list-disc pl-5 text-xs text-foreground">
                  {data.freeBlocks.slice(0, 8).map((b: Interval) => (
                    <li key={b.start}>{fmt(b.start)} – {fmt(b.end)}</li>
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
