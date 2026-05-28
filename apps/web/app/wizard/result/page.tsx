'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PromptOutput } from '@/components/PromptOutput';
import { FeedbackForm } from '@/components/FeedbackForm';

type LastResult = {
  prompt: string;
  metadata: {
    promptHash: string;
    generator: 'opus' | 'deterministic';
    fallbackReason?: 'budget-exhausted' | 'api-error';
  };
  entryId: string;
};

export default function ResultPage() {
  const [data, setData] = useState<LastResult | null>(null);

  useEffect(() => {
    const raw = sessionStorage.getItem('pomfret.lastResult');
    if (raw) setData(JSON.parse(raw) as LastResult);
  }, []);

  if (!data) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-12">
        <p>No prompt found. <Link href="/wizard" className="underline">Start over</Link>.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <h1 className="text-2xl font-semibold">Your prompt is ready.</h1>
      <p className="mt-2 text-slate-600">
        Copy it, paste it into your LLM, and run a real study session.
      </p>

      {data.metadata.generator === 'deterministic' && (
        <Alert className="mt-4">
          <AlertDescription>
            We couldn&apos;t reach Opus 4.7 for this generation — used the deterministic templates instead. The prompt is still solid, but lacks the topic-specific tailoring Opus would have added.
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-6">
        <PromptOutput prompt={data.prompt} />
      </div>

      <div className="mt-8 rounded-lg border bg-white p-6">
        <h2 className="font-semibold">How did this go?</h2>
        <p className="mt-1 text-sm text-slate-600">
          Once you&apos;ve used it, come back and rate the prompt. This helps me make the templates better.
        </p>
        <div className="mt-4">
          <FeedbackForm
            promptHash={data.metadata.promptHash}
            entryId={data.entryId}
          />
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <Link href="/wizard"><Button variant="outline">New prompt</Button></Link>
        <Link href="/history"><Button variant="ghost">See past prompts</Button></Link>
      </div>
    </main>
  );
}
