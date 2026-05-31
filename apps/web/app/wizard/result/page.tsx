'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PromptOutput } from '@/components/PromptOutput';
import { FeedbackForm } from '@/components/FeedbackForm';
import { SignedOut, SignUpButton, SignInButton } from '@clerk/nextjs';
import { describeAttachedKinds, type MaterialKind } from '@composed-prompts/shared';
import { StudySchedule } from '@/components/StudySchedule';

type LastResult = {
  prompt: string;
  metadata: {
    promptHash: string;
    generator: 'opus' | 'deterministic';
    fallbackReason?: 'budget-exhausted' | 'api-error' | 'feature-disabled';
    generationId: string;
  };
  entryId: string;
  attachedMaterialKinds?: MaterialKind[];
  schedule?: {
    assessmentDate: string;
    hoursAvailable: number;
    courseLabel: string;
    assessmentType: string;
  };
};

export default function ResultPage() {
  const [data, setData] = useState<LastResult | null>(null);
  const [showSchedule, setShowSchedule] = useState(false);

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

      {data.attachedMaterialKinds && data.attachedMaterialKinds.length > 0 && (
        <Alert className="mt-4 border-indigo-200 bg-indigo-50">
          <AlertDescription className="text-indigo-900">
            Remember to attach your {describeAttachedKinds(data.attachedMaterialKinds)} to your AI
            when you paste this prompt — the prompt asks it to read your material first.
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-6">
        <PromptOutput prompt={data.prompt} />
      </div>

      {data.schedule && (
        <div className="mt-8">
          {showSchedule ? (
            <StudySchedule
              assessmentDate={data.schedule.assessmentDate}
              hoursAvailable={data.schedule.hoursAvailable}
              courseLabel={data.schedule.courseLabel}
              assessmentType={data.schedule.assessmentType}
            />
          ) : (
            <Button variant="outline" onClick={() => setShowSchedule(true)}>
              Plan study time (optional)
            </Button>
          )}
        </div>
      )}

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
    </main>
  );
}
