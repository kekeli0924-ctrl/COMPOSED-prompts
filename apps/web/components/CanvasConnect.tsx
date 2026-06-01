'use client';

import { useEffect, useState } from 'react';
import { useUser } from '@clerk/nextjs';
import { useApi } from '@/lib/use-api';
import { Button } from '@/components/ui/button';
import type { CanvasStatus, CanvasConnectResponse, CanvasUpcomingResponse, UpcomingAssessment } from '@composed-prompts/shared';

const fmtDue = (iso: string) => new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });

export function CanvasConnect() {
  const { isLoaded, isSignedIn } = useUser();
  const { apiGet, apiPost } = useApi();
  const [connected, setConnected] = useState<boolean | null>(null);
  const [items, setItems] = useState<UpcomingAssessment[]>([]);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showGuide, setShowGuide] = useState(false);

  useEffect(() => {
    if (!isLoaded || !isSignedIn) return;
    apiGet<CanvasStatus>('/api/me/canvas/status').then((s) => setConnected(s.connected)).catch(() => setConnected(false));
  }, [isLoaded, isSignedIn, apiGet]);

  useEffect(() => {
    if (!connected) return;
    apiGet<CanvasUpcomingResponse>('/api/me/canvas/upcoming')
      .then((r) => { setItems(r.items); if (r.connected === false) setConnected(false); })
      .catch(() => {});
  }, [connected, apiGet]);

  const connect = async () => {
    if (!token.trim()) return;
    setBusy(true); setError(null);
    try {
      const res = await apiPost<CanvasConnectResponse>('/api/me/canvas/connect', { token: token.trim() });
      if (res.connected) { setToken(''); setConnected(true); }
      else setError("That token didn't work — double-check you copied the whole thing.");
    } catch { setError('Something went wrong — try again.'); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    setBusy(true);
    try { await apiPost('/api/me/canvas/disconnect', {}); setConnected(false); setItems([]); } catch {}
    finally { setBusy(false); }
  };

  if (!isLoaded || connected === null) return null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <dt className="text-muted-foreground">Canvas</dt>
      <dd className="mt-1">
        {!connected ? (
          <>
            <p className="text-muted-foreground">Connect Canvas so Composed sees your upcoming assessments automatically.</p>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Paste your Canvas access token"
              className="mt-2 block w-full rounded-xl border border-input bg-transparent px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            />
            <div className="mt-2 flex items-center gap-3">
              <Button type="button" size="sm" onClick={connect} disabled={busy || !token.trim()}>Connect</Button>
              <button type="button" onClick={() => setShowGuide((v) => !v)} className="text-xs text-primary underline">
                {showGuide ? 'Hide' : 'How do I get my token?'}
              </button>
            </div>
            {error && <p className="mt-1 text-xs text-destructive">{error}</p>}
            {showGuide && (
              <ol className="mt-3 list-decimal space-y-1 rounded-2xl bg-muted p-3 pl-7 text-xs text-foreground">
                <li>Go to <span className="font-medium">pomfret.instructure.com</span> and sign in.</li>
                <li>Click your profile picture → <span className="font-medium">Account → Settings</span>.</li>
                <li>Scroll to <span className="font-medium">Approved Integrations</span> → <span className="font-medium">+ New Access Token</span>.</li>
                <li>Purpose: type <span className="font-medium">&quot;Composed&quot;</span>, leave the expiry blank → <span className="font-medium">Generate Token</span>.</li>
                <li>Copy the token and paste it above → Connect.</li>
                <li className="text-muted-foreground">Don&apos;t see &quot;+ New Access Token&quot;? Your school may have disabled it — let a teacher know.</li>
              </ol>
            )}
          </>
        ) : (
          <>
            <p className="font-medium text-foreground">Canvas connected ✓</p>
            {items.length > 0 ? (
              <ul className="mt-1 list-disc pl-5 text-xs text-foreground">
                {items.slice(0, 6).map((i) => (
                  <li key={i.id}>{i.title}{i.course ? ` · ${i.course}` : ''} — due {fmtDue(i.dueDate)}</li>
                ))}
              </ul>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">No upcoming assessments right now.</p>
            )}
            <Button type="button" size="sm" variant="outline" onClick={disconnect} disabled={busy} className="mt-2">Disconnect</Button>
          </>
        )}
      </dd>
    </div>
  );
}
