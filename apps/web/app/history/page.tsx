'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { listHistory, rateHistoryEntry, type HistoryEntry } from '@/lib/storage/history';
import { findCourse, STUDY_MODE_LABELS } from '@composed-prompts/shared';

export default function HistoryPage() {
  const [entries, setEntries] = useState<HistoryEntry[] | null>(null);

  useEffect(() => {
    setEntries(listHistory());
  }, []);

  if (entries === null) {
    return <main className="mx-auto max-w-3xl px-6 py-12">Loading…</main>;
  }

  if (entries.length === 0) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <h1 className="text-2xl font-semibold">Past prompts</h1>
        <Alert className="mt-4">
          <AlertDescription>
            No saved prompts yet. <Link className="underline" href="/wizard">Generate one</Link>.
          </AlertDescription>
        </Alert>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Past prompts</h1>
      <p className="mt-2 text-sm text-slate-600">
        Stored in your browser only — nothing is sent to any server unless you submit a rating.
      </p>
      <ul className="mt-6 grid gap-3">
        {entries.map((e) => (
          <HistoryRow key={e.id} entry={e} onRate={(r) => rateHistoryEntry(e.id, r)} />
        ))}
      </ul>

      <section className="mt-16 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6">
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
          Behind the scenes
        </span>
        <h3 className="mt-1 text-xl font-semibold">Where your history lives</h3>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
          <p>
            Right now, your prompt history lives entirely in your browser&apos;s{' '}
            <strong>localStorage</strong> — no server has a copy. That means it&apos;s
            private (only you can see it), it doesn&apos;t cost anything to store, and it
            disappears if you clear your browser data or use a different device.
          </p>
          <p>
            For privacy, I scrub any pasted assignment material out of the saved prompt
            text before it goes into localStorage. The <strong>Material</strong> section
            of every saved prompt shows{' '}
            <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">
              [material redacted — not stored locally]
            </code>
            . You can verify this by expanding any past prompt.
          </p>
          <p>
            When you submit a rating, only the rating itself (1–5) and a SHA-256 hash of
            the prompt are sent to the backend — never the prompt content or anything
            identifying. The hash lets the system aggregate ratings per prompt
            <em> shape</em> without knowing whose prompt it was.
          </p>
          <p>
            The architecture I&apos;m building this on top of will let signed-in users
            sync their history across devices via a Postgres database. That part lives
            behind an authentication layer (see <strong>How it works</strong> in the
            header for the full picture).
          </p>
        </div>
      </section>
    </main>
  );
}

function HistoryRow({ entry, onRate }: { entry: HistoryEntry; onRate: (r: 1 | 2 | 3 | 4 | 5) => void }) {
  const [expanded, setExpanded] = useState(false);
  const course = entry.courseId ? findCourse(entry.courseId)?.name : 'Free-text class';
  return (
    <li className="rounded-lg border bg-white p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm text-slate-500">
            {new Date(entry.createdAt).toLocaleString()}
          </div>
          <div className="font-medium">{course} · {STUDY_MODE_LABELS[entry.mode]}</div>
          <div className="text-xs text-slate-500">{entry.llm} / {entry.model}</div>
        </div>
        <div className="flex flex-col items-end gap-2">
          {entry.rating ? (
            <div className="text-yellow-500">{'★'.repeat(entry.rating)}{'☆'.repeat(5 - entry.rating)}</div>
          ) : (
            <RatingButtons onRate={onRate} />
          )}
        </div>
      </div>
      <Button size="sm" variant="ghost" onClick={() => setExpanded((v) => !v)} className="mt-3">
        {expanded ? 'Hide prompt' : 'Show prompt'}
      </Button>
      {expanded && (
        <pre className="mt-3 whitespace-pre-wrap break-words rounded bg-slate-50 p-3 text-xs font-mono">
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
          className="h-7 w-7 rounded border bg-white text-sm hover:bg-yellow-100"
        >
          {r}
        </button>
      ))}
    </div>
  );
}
