'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { listHistory, rateHistoryEntry } from '@/lib/storage/history';
import { apiPost } from '@/lib/api-client';
import type { FeedbackPayload } from '@composed-prompts/shared';

const STARS = [1, 2, 3, 4, 5] as const;

export function FeedbackForm(props: { promptHash: string; entryId: string; generationId: string }) {
  const [rating, setRating] = useState<number | null>(null);
  const [text, setText] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    if (!rating) return;
    const entry = listHistory().find((e) => e.id === props.entryId);
    if (!entry) return;
    setError(null);
    try {
      const payload: FeedbackPayload = {
        generationId: props.generationId,
        promptHash: props.promptHash,
        rating: rating as 1 | 2 | 3 | 4 | 5,
        text: text.trim() || undefined,
      };
      await apiPost('/api/feedback', payload);
      rateHistoryEntry(entry.id, rating as 1 | 2 | 3 | 4 | 5, text.trim() || undefined);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to save');
    }
  };

  if (submitted) {
    return <p className="text-sm text-green-700">Thanks — saved.</p>;
  }

  return (
    <div className="grid gap-3">
      <div className="flex gap-1">
        {STARS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setRating(s)}
            className={`h-10 w-10 rounded-md border text-lg ${
              rating !== null && s <= rating
                ? 'bg-yellow-400 border-yellow-500'
                : 'bg-white hover:bg-slate-50'
            }`}
            aria-label={`${s} out of 5`}
          >
            ★
          </button>
        ))}
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, 1000))}
        placeholder="Anything that worked well or didn't? (optional)"
        rows={3}
      />
      <div className="flex justify-end">
        <Button disabled={rating === null} onClick={submit}>Save rating</Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
