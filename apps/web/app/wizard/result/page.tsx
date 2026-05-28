'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PromptOutput } from '@/components/PromptOutput';
import { FeedbackForm } from '@/components/FeedbackForm';
import { RagPanel } from '@/components/RagPanel';
import { SignedOut, SignUpButton, SignInButton } from '@clerk/nextjs';

type LastResult = {
  prompt: string;
  metadata: {
    promptHash: string;
    generator: 'opus' | 'deterministic';
    fallbackReason?: 'budget-exhausted' | 'api-error' | 'feature-disabled';
    generationId: string;
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

      <div className="mt-8">
        <RagPanel eyebrow="What happened behind that prompt — the RAG learning system" />
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
            generationId={data.metadata.generationId}
          />
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <Link href="/wizard"><Button variant="outline">New prompt</Button></Link>
        <Link href="/history"><Button variant="ghost">See past prompts</Button></Link>
      </div>

      <SignedOut>
        <div className="mt-6 rounded-lg border border-indigo-200 bg-indigo-50 p-4">
          <p className="text-sm font-medium text-indigo-900">
            Save this prompt and unlock smarter ones over time
          </p>
          <p className="mt-1 text-sm text-indigo-700">
            Sign up to keep your history across devices. The system also starts learning your
            preferences and uses past high-rated prompts to make new ones even better.
          </p>
          <div className="mt-3 flex gap-2">
            <SignUpButton mode="modal">
              <button className="rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
                Sign up
              </button>
            </SignUpButton>
            <SignInButton mode="modal">
              <button className="rounded border border-indigo-300 px-3 py-1.5 text-sm font-medium text-indigo-700 hover:bg-indigo-100">
                Sign in
              </button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>

      <section className="mt-16 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6">
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
          Behind the scenes
        </span>
        <h3 className="mt-1 text-xl font-semibold">How that prompt was just generated</h3>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
          <p>
            That prompt was written by <strong>Claude Opus 4.7</strong>, Anthropic&apos;s
            most capable model. The wizard inputs you submitted (course, mode, time
            available, confidence, what confuses you, etc.) were sent to a backend
            service I built, which called the Anthropic API with a custom system prompt
            describing the <strong>Pomfret-Study Framework</strong> — a 7-section
            structure I designed.
          </p>
          <p>
            The 7 sections are: <strong>Role</strong> (who the tutor LLM should be),{' '}
            <strong>About Me</strong> (the student&apos;s context),{' '}
            <strong>Material</strong> (whatever was pasted), <strong>Goal</strong>{' '}
            (the assessment + time), <strong>Interaction Style</strong> (how the tutor
            should engage), <strong>Output Spec</strong> (the exact deliverable shape),
            and <strong>Self-Check</strong> (quality control).
          </p>
          <p>
            Notice that the output above is formatted with XML tags (for Claude),
            markdown headers (for GPT), or numbered steps (for Gemini) depending on
            which LLM you picked. That formatting is controlled by a{' '}
            <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">model-profiles.json</code>{' '}
            file I maintain — each model gets the format it responds to best.
          </p>
          <p>
            If Opus 4.7 is unavailable or the daily budget cap is hit, the system falls
            back to a fully deterministic version of the same prompt built from
            templates — slower-quality but always available. That&apos;s why you see the
            banner up top sometimes.
          </p>
          <p className="text-xs text-slate-500">
            One generation costs roughly $0.07 in Anthropic credits. Daily budget is
            capped at $10/day in the production environment.
          </p>
        </div>
      </section>
    </main>
  );
}
