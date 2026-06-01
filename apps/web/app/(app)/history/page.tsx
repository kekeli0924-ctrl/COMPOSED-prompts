'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { listHistory, rateHistoryEntry, type HistoryEntry } from '@/lib/storage/history';
import { findCourse, STUDY_MODE_LABELS } from '@composed-prompts/shared';
import { useUser } from '@clerk/nextjs';
import { useApi } from '@/lib/use-api';
import type { HistoryResponse } from '@composed-prompts/shared';

type DisplayEntry = HistoryEntry & { source: 'local' | 'server' };

export default function HistoryPage() {
  const { isLoaded, isSignedIn } = useUser();
  const { apiGet } = useApi();
  const [entries, setEntries] = useState<DisplayEntry[] | null>(null);

  useEffect(() => {
    if (!isLoaded) return;
    if (isSignedIn) {
      apiGet<HistoryResponse>('/api/me/history')
        .then((res) => {
          setEntries(
            res.entries.map((e) => ({
              id: e.id,
              createdAt: new Date(e.createdAt).getTime(),
              promptText: e.promptText,
              llm: e.llm,
              model: e.model,
              mode: e.mode,
              courseId: e.courseId,
              rating: (e.rating ?? undefined) as DisplayEntry['rating'],
              ratingText: e.ratingText ?? undefined,
              source: 'server',
            })),
          );
        })
        .catch(() => setEntries([]));
    } else {
      setEntries(listHistory().map((e) => ({ ...e, source: 'local' })));
    }
  }, [isLoaded, isSignedIn, apiGet]);

  if (!isLoaded || entries === null) {
    return <main className="mx-auto max-w-3xl px-6 py-12">Loading…</main>;
  }

  if (entries.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="font-serif text-2xl font-semibold text-foreground">Past prompts</h1>
        <Alert className="mt-4">
          <AlertDescription className="text-muted-foreground">
            No saved prompts yet. <Link className="underline" href="/wizard">Generate one</Link>.
            {!isSignedIn && (
              <> Sign up to save prompts across devices.</>
            )}
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Past prompts</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        {isSignedIn
          ? 'Synced from your account. Available on any device.'
          : 'Stored in this browser only. Sign up to sync across devices.'}
      </p>
      <ul className="mt-6 grid gap-3">
        {entries.map((e) => (
          <HistoryRow
            key={e.id}
            entry={e}
            onRate={(r) => {
              if (e.source === 'local') rateHistoryEntry(e.id, r);
              // For server entries, rating is done from the result page right after
              // generation; server-side re-rating could be added later but isn't in v1 scope.
            }}
          />
        ))}
      </ul>
    </main>
  );
}

function HistoryRow({
  entry,
  onRate,
}: {
  entry: DisplayEntry;
  onRate: (r: 1 | 2 | 3 | 4 | 5) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const course = entry.courseId ? findCourse(entry.courseId)?.name : 'Free-text class';
  return (
    <li className="rounded-2xl border border-border bg-card p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted-foreground">
            {new Date(entry.createdAt).toLocaleString()}
          </div>
          <div className="mt-1 font-medium text-foreground">{course} · {STUDY_MODE_LABELS[entry.mode]}</div>
          <div className="text-xs text-muted-foreground">{entry.llm} / {entry.model}</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {entry.rating ? (
            <div className="text-yellow-500">
              {'★'.repeat(entry.rating)}
              {'☆'.repeat(5 - entry.rating)}
            </div>
          ) : entry.source === 'local' ? (
            <RatingButtons onRate={onRate} />
          ) : (
            <span className="text-xs text-muted-foreground">no rating</span>
          )}
        </div>
      </div>
      <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)} className="mt-3">
        {expanded ? 'Hide prompt' : 'Show prompt'}
      </Button>
      {expanded && (
        <pre className="mt-3 whitespace-pre-wrap break-words rounded-2xl bg-muted p-3 text-xs font-mono text-foreground">
          {entry.promptText}
        </pre>
      )}
    </li>
  );
}

function RatingButtons({ onRate }: { onRate: (r: 1 | 2 | 3 | 4 | 5) => void }) {
  return (
    <div className="flex gap-1">
      {[1, 2, 3, 4, 5].map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onRate(r as 1 | 2 | 3 | 4 | 5)}
          className="h-7 w-7 rounded-full border border-border bg-card text-sm text-foreground hover:bg-muted"
        >
          {r}
        </button>
      ))}
    </div>
  );
}
