'use client';

import { useState } from 'react';
import { SignedIn, SignedOut, SignInButton } from '@clerk/nextjs';
import { useApi } from '@/lib/use-api';
import type { SharpenResponse } from '@composed-prompts/shared';

const btn = 'rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-50';

export function SharpenPanel({
  generationId,
  basePrompt,
  onImproved,
}: {
  generationId: string;
  basePrompt: string;
  onImproved: (improved: string) => void;
}) {
  const { apiPost } = useApi();
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [critique, setCritique] = useState<string | null>(null);
  const [showCritique, setShowCritique] = useState(false);

  const sharpen = async (): Promise<void> => {
    setState('loading');
    try {
      const res = await apiPost<SharpenResponse>('/api/generate/sharpen', { generationId, basePrompt });
      if (res.ok) {
        onImproved(res.improvedPrompt);
        setCritique(res.critique);
        setState('done');
      } else {
        setState('error');
      }
    } catch {
      setState('error');
    }
  };

  return (
    <div className="mt-4 rounded-lg border bg-white p-4">
      <SignedOut>
        <p className="text-sm text-slate-600">Want a second frontier model to critique and sharpen this prompt?</p>
        <SignInButton mode="modal">
          <button type="button" className={`${btn} mt-2`}>Sign in to sharpen with a 2nd model</button>
        </SignInButton>
      </SignedOut>
      <SignedIn>
        {state === 'idle' && (
          <>
            <p className="text-sm text-slate-600">Have GPT-5.5 critique this prompt and Opus revise it — a sharper version.</p>
            <button type="button" onClick={sharpen} className={`${btn} mt-2`}>Sharpen with a 2nd model</button>
          </>
        )}
        {state === 'loading' && <p className="text-sm text-slate-500">A second model is critiquing &amp; sharpening — about 30 seconds…</p>}
        {state === 'error' && (
          <p className="text-sm text-slate-600">Couldn&apos;t sharpen right now — your prompt above is still solid.</p>
        )}
        {state === 'done' && (
          <div className="text-sm">
            <p className="font-medium text-emerald-700">Sharpened ✓ — the prompt above is the improved version.</p>
            {critique && (
              <>
                <button type="button" onClick={() => setShowCritique((v) => !v)} className="mt-2 text-xs text-indigo-600 underline">
                  {showCritique ? 'Hide' : 'What the 2nd model flagged'}
                </button>
                {showCritique && (
                  <pre className="mt-2 whitespace-pre-wrap rounded bg-slate-50 p-3 text-xs text-slate-700">{critique}</pre>
                )}
              </>
            )}
          </div>
        )}
      </SignedIn>
    </div>
  );
}
