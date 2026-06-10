'use client';

import { useEffect, useState } from 'react';
import { useApi } from '@/lib/use-api';
import { findCourse } from '@composed-prompts/shared';
import type { OutcomeRequest, OutcomeResponse, PendingOutcome, PendingOutcomesResponse } from '@composed-prompts/shared';

const OPTIONS: { value: 1 | 2 | 3 | 4 | 5; label: string }[] = [
  { value: 1, label: 'Rough' },
  { value: 2, label: 'Shaky' },
  { value: 3, label: 'OK' },
  { value: 4, label: 'Good' },
  { value: 5, label: 'Aced' },
];

// Dismissals are localStorage-only by design — no server state for "don't ask".
const LS_KEY = 'pomfret.dismissedOutcomes';

const readDismissed = (): string[] => {
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? '[]');
    return Array.isArray(raw) ? raw : [];
  } catch {
    return [];
  }
};

// One-tap post-assessment check-in cards (signed-in dashboard only — the dashboard's
// anonymous branch returns before rendering this). Renders nothing with no pending items.
export function PendingOutcomes() {
  const { apiGet, apiPost } = useApi();
  const [items, setItems] = useState<PendingOutcome[]>([]);
  const [thankedId, setThankedId] = useState<string | null>(null);

  useEffect(() => {
    apiGet<PendingOutcomesResponse>('/api/me/pending-outcomes')
      .then((r) => {
        const dismissed = new Set(readDismissed());
        setItems(r.items.filter((i) => !dismissed.has(i.generationId)));
      })
      .catch(() => setItems([]));
  }, [apiGet]);

  const dismiss = (id: string): void => {
    localStorage.setItem(LS_KEY, JSON.stringify([...readDismissed(), id]));
    setItems((prev) => prev.filter((i) => i.generationId !== id));
  };

  const submit = async (id: string, outcome: 1 | 2 | 3 | 4 | 5): Promise<void> => {
    try {
      const payload: OutcomeRequest = { generationId: id, outcome };
      await apiPost<OutcomeResponse>('/api/outcome', payload);
      setThankedId(id);
      setTimeout(() => {
        setItems((prev) => prev.filter((i) => i.generationId !== id));
        setThankedId(null);
      }, 1500);
    } catch {
      // Leave the card; the student can tap again.
    }
  };

  if (items.length === 0) return null;

  return (
    <div>
      <p className="mt-8 mb-3 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">How did it go?</p>
      <div className="space-y-2">
        {items.map((item) => {
          const course = item.courseId ? findCourse(item.courseId)?.name ?? item.courseId : 'your class';
          return (
            <div key={item.generationId} className="rounded-2xl border border-border bg-card px-4 py-3">
              {thankedId === item.generationId ? (
                <p className="text-sm text-green-700">Thanks — logged.</p>
              ) : (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground">
                      How did the {item.assessmentType ?? 'assessment'} for {course} go?
                    </p>
                    <button
                      type="button"
                      aria-label="Dismiss"
                      onClick={() => dismiss(item.generationId)}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      ×
                    </button>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {OPTIONS.map((o) => (
                      <button
                        key={o.value}
                        type="button"
                        onClick={() => submit(item.generationId, o.value)}
                        className="rounded-full border border-border px-3 py-1 text-xs text-foreground hover:bg-muted"
                      >
                        {o.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
