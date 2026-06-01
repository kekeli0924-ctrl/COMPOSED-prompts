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
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <span className="text-sm font-medium text-muted-foreground">Your prompt</span>
        <Button size="sm" variant="outline" onClick={copy}>{copied ? 'Copied!' : 'Copy'}</Button>
      </div>
      <pre className="whitespace-pre-wrap break-words p-4 text-sm font-mono text-foreground">
        {prompt}
      </pre>
    </div>
  );
}
