'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PromptOutput } from '@/components/PromptOutput';
import { FeedbackForm } from '@/components/FeedbackForm';
import { SignedIn, SignedOut, SignUpButton, SignInButton } from '@clerk/nextjs';
import { describeAttachedKinds, type MaterialKind } from '@composed-prompts/shared';
import { StudySchedule } from '@/components/StudySchedule';
import { SharpenPanel } from '@/components/SharpenPanel';
import { RecapForm } from '@/components/RecapForm';

type LastResult = {
  prompt: string;
  metadata: {
    promptHash: string;
    generator: 'opus' | 'sonnet' | 'deterministic';
    fallbackReason?: 'budget-exhausted' | 'api-error' | 'feature-disabled' | 'opus-capped';
    generationId: string;
    usedRecap?: { id: string; createdAt: string };
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
  const [improvedPrompt, setImprovedPrompt] = useState<string | null>(null);
  const [showOriginal, setShowOriginal] = useState(false);

  useEffect(() => {
    const raw = sessionStorage.getItem('pomfret.lastResult');
    if (raw) setData(JSON.parse(raw) as LastResult);
  }, []);

  if (!data) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p>No prompt found. <Link href="/wizard" className="underline">Start over</Link>.</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-serif text-2xl font-semibold text-foreground">Your study prompt is ready</h1>
      <p className="mt-2 text-muted-foreground">
        Copy it, paste it into your LLM, and run a real study session.
      </p>
      {data.metadata.usedRecap && (
        <p className="mt-1 text-xs text-muted-foreground">
          Personalized using your session recap from{' '}
          {new Date(data.metadata.usedRecap.createdAt).toLocaleDateString()}.
        </p>
      )}

      {data.metadata.generator === 'deterministic' && (
        <Alert className="mt-4">
          <AlertDescription>
            We couldn&apos;t reach the AI model for this generation — used the deterministic templates instead. The prompt is still solid, but lacks the topic-specific tailoring it would have added.
          </AlertDescription>
        </Alert>
      )}

      {data.attachedMaterialKinds && data.attachedMaterialKinds.length > 0 && (
        <Alert className="mt-4 border-border bg-secondary">
          <AlertDescription className="text-foreground">
            Remember to attach your {describeAttachedKinds(data.attachedMaterialKinds)} to your AI
            when you paste this prompt — the prompt asks it to read your material first.
          </AlertDescription>
        </Alert>
      )}

      <div className="mt-6">
        <PromptOutput prompt={improvedPrompt && !showOriginal ? improvedPrompt : data.prompt} />
        {improvedPrompt && (
          <button type="button" onClick={() => setShowOriginal((v) => !v)} className="mt-2 text-xs text-primary underline">
            {showOriginal ? 'Show sharpened' : 'See original'}
          </button>
        )}
      </div>
      <SharpenPanel
        generationId={data.metadata.generationId}
        basePrompt={data.prompt}
        onImproved={setImprovedPrompt}
      />

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

      <div className="mt-8 rounded-2xl border border-border bg-card p-6">
        <h2 className="font-serif font-semibold text-foreground">How did this go?</h2>
        <p className="mt-1 text-sm text-muted-foreground">
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

      <SignedIn>
        <div className="mt-6 rounded-2xl border border-border bg-card p-6">
          <h2 className="font-serif font-semibold text-foreground">Paste your session recap</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            After you study, your AI ends by recapping what you got wrong and writing a follow-up prompt. Paste that here so Composed can pick up where you left off next time.
          </p>
          <div className="mt-4">
            <RecapForm generationId={data.metadata.generationId} />
          </div>
        </div>
      </SignedIn>

      <div className="mt-6 flex gap-3">
        <Link href="/wizard"><Button variant="outline">New prompt</Button></Link>
        <Link href="/history"><Button variant="ghost">See past prompts</Button></Link>
      </div>

      <SignedOut>
        <div className="mt-6 rounded-2xl border border-border bg-secondary p-4">
          <p className="text-sm font-medium text-foreground">
            Save this prompt and unlock smarter ones over time
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            Sign up to keep your history across devices. The system also starts learning your
            preferences and uses past high-rated prompts to make new ones even better.
          </p>
          <div className="mt-3 flex gap-2">
            <SignUpButton mode="modal">
              <button className="rounded-full bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
                Sign up
              </button>
            </SignUpButton>
            <SignInButton mode="modal">
              <button className="rounded-full border border-border bg-card px-4 py-2 text-sm font-medium text-foreground hover:bg-muted">
                Sign in
              </button>
            </SignInButton>
          </div>
        </div>
      </SignedOut>
    </main>
  );
}
