'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function PromptOutput({ prompt }: { prompt: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };
  return (
    <div className="rounded-lg border bg-slate-50">
      <div className="flex items-center justify-between border-b bg-white px-4 py-2">
        <span className="text-sm font-medium text-slate-600">Your prompt</span>
        <Button size="sm" onClick={copy}>{copied ? 'Copied!' : 'Copy'}</Button>
      </div>
      <pre className="whitespace-pre-wrap break-words p-4 text-sm font-mono text-slate-800">
        {prompt}
      </pre>
    </div>
  );
}
