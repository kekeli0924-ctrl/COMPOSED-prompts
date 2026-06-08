'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useApi } from '@/lib/use-api';
import type { RecapRequest, RecapResponse } from '@composed-prompts/shared';

const MAX = 20000; // matches the server-side ceiling

// Signed-in only (the result page gates this in a <SignedIn> block). Captures the
// recap the student's downstream AI produced and stores it via POST /api/recap.
export function RecapForm(props: { generationId: string }) {
  const { apiPost } = useApi();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (): Promise<void> => {
    const recap = text.trim();
    if (!recap || busy) return;
    setError(null);
    setBusy(true);
    try {
      const payload: RecapRequest = { generationId: props.generationId, text: recap };
      await apiPost<RecapResponse>('/api/recap', payload);
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'failed to save');
    } finally {
      setBusy(false);
    }
  };

  if (submitted) {
    return (
      <p className="text-sm text-green-700">
        Saved — this recap is private to you and auto-deletes after ~30 days.
      </p>
    );
  }

  return (
    <div className="grid gap-3">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value.slice(0, MAX))}
        placeholder="Paste the recap your AI gave you at the end — what you got wrong, plus the follow-up prompt it wrote."
        rows={4}
      />
      <p className="text-xs text-muted-foreground">
        Private to you. Auto-deletes after ~30 days.
      </p>
      <div className="flex justify-end">
        <Button disabled={!text.trim() || busy} onClick={submit}>
          {busy ? 'Saving…' : 'Save recap'}
        </Button>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
