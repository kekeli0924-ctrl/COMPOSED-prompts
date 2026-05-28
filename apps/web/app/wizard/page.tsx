'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ModelPicker } from '@/components/ModelPicker';
import { CoursePicker } from '@/components/CoursePicker';
import { ModePicker } from '@/components/ModePicker';
import { AssessmentStep } from '@/components/AssessmentStep';
import { MaterialStep } from '@/components/MaterialStep';
import { AboutMeStep } from '@/components/AboutMeStep';
import { RagPanel } from '@/components/RagPanel';
import type { WizardInputs } from '@composed-prompts/shared';
import { saveHistoryEntry } from '@/lib/storage/history';

type PartialWizardState = Partial<WizardInputs> & {
  material: string;
  understanding: string;
  confusion: string;
  courseFreeText: string;
};

const STEP_TITLES = [
  '1 / 6 · Which LLM?',
  '2 / 6 · Which class?',
  '3 / 6 · How do you want to study?',
  '4 / 6 · About the assessment',
  '5 / 6 · Material (optional)',
  '6 / 6 · About you (optional)',
];

const today = (): string => new Date().toISOString().slice(0, 10);

export default function WizardPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [inputs, setInputs] = useState<PartialWizardState>({
    assessmentDate: today(),
    material: '',
    understanding: '',
    confusion: '',
    courseFreeText: '',
  });

  const update = (patch: Partial<WizardInputs> & { material?: string; understanding?: string; confusion?: string; courseFreeText?: string }): void => {
    setInputs((prev) => ({ ...prev, ...patch }));
  };

  const canProceed = (): boolean => {
    switch (step) {
      case 0: return Boolean(inputs.provider && inputs.model);
      case 1: return Boolean(inputs.courseId || inputs.courseFreeText.trim().length > 0);
      case 2: return Boolean(inputs.mode);
      case 3: return Boolean(inputs.assessmentType && inputs.assessmentDate && inputs.hoursAvailable);
      case 4: return true;
      case 5: return true;
      default: return false;
    }
  };

  const submit = async (): Promise<void> => {
    setSubmitting(true);
    setError(null);

    const payload: WizardInputs = {
      provider: inputs.provider!,
      model: inputs.model!,
      courseId: inputs.courseId ?? null,
      courseFreeText: inputs.courseFreeText.trim() || undefined,
      mode: inputs.mode!,
      assessmentType: inputs.assessmentType!,
      assessmentDate: inputs.assessmentDate!,
      hoursAvailable: inputs.hoursAvailable!,
      material: inputs.material.trim() || undefined,
      confidence: inputs.confidence,
      understanding: inputs.understanding.trim() || undefined,
      confusion: inputs.confusion.trim() || undefined,
    };

    // Floor the loading-screen visibility so users always see at least one full
    // shimmer cycle of the composing animation. Opus calls take ~10s in
    // production, so this only matters when the request is unexpectedly fast
    // (e.g. local dev hitting the deterministic fallback, or a cache hit).
    const MIN_LOADING_MS = 4500;
    const startedAt = Date.now();

    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? `Request failed (${res.status})`);
        setSubmitting(false);
        return;
      }
      const data = await res.json();
      const entry = await saveHistoryEntry({
        promptText: data.prompt,
        llm: payload.provider,
        model: payload.model,
        mode: payload.mode,
        courseId: payload.courseId,
      });
      sessionStorage.setItem(
        'pomfret.lastResult',
        JSON.stringify({ ...data, entryId: entry.id }),
      );

      // Hold the loading screen until at least MIN_LOADING_MS has elapsed.
      const elapsed = Date.now() - startedAt;
      if (elapsed < MIN_LOADING_MS) {
        await new Promise((r) => setTimeout(r, MIN_LOADING_MS - elapsed));
      }
      router.push('/wizard/result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
      setSubmitting(false);
    }
  };

  if (submitting) {
    return <ComposingScreen />;
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <div className="mb-8">
        <Progress value={((step + 1) / 6) * 100} />
        <h2 className="mt-3 text-sm font-medium text-slate-500">{STEP_TITLES[step]}</h2>
      </div>

      <div className="rounded-lg border bg-white p-6 shadow-sm">
        {step === 0 && (
          <ModelPicker
            provider={inputs.provider ?? ''}
            model={inputs.model ?? ''}
            onProviderChange={(v) => update({ provider: v, model: '' })}
            onModelChange={(v) => update({ model: v })}
          />
        )}
        {step === 1 && (
          <CoursePicker
            courseId={inputs.courseId ?? null}
            courseFreeText={inputs.courseFreeText}
            onPick={(id, freeText) => update({ courseId: id, courseFreeText: freeText ?? '' })}
          />
        )}
        {step === 2 && (
          <ModePicker
            value={inputs.mode}
            onChange={(v) => update({ mode: v })}
          />
        )}
        {step === 3 && (
          <AssessmentStep
            assessmentType={inputs.assessmentType}
            assessmentDate={inputs.assessmentDate ?? today()}
            hoursAvailable={inputs.hoursAvailable}
            onChange={(p) => update(p)}
          />
        )}
        {step === 4 && (
          <MaterialStep
            material={inputs.material}
            onChange={(v) => update({ material: v })}
          />
        )}
        {step === 5 && (
          <AboutMeStep
            confidence={inputs.confidence}
            understanding={inputs.understanding}
            confusion={inputs.confusion}
            onChange={(p) => update({
              confidence: p.confidence as 1 | 2 | 3 | 4 | 5 | undefined,
              understanding: p.understanding,
              confusion: p.confusion,
            })}
          />
        )}
      </div>

      {error && (
        <Alert className="mt-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="mt-6 flex justify-between">
        <Button variant="outline" disabled={step === 0 || submitting} onClick={() => setStep((s) => s - 1)}>
          Back
        </Button>
        {step < 5 ? (
          <Button disabled={!canProceed() || submitting} onClick={() => setStep((s) => s + 1)}>
            Next
          </Button>
        ) : (
          <Button disabled={submitting} onClick={submit}>
            {submitting ? 'Generating...' : 'Generate prompt'}
          </Button>
        )}
      </div>

      <section className="mt-16 rounded-lg border-2 border-dashed border-slate-300 bg-slate-50 p-6">
        <span className="text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
          Behind the scenes
        </span>
        <h3 className="mt-1 text-xl font-semibold">What this wizard is doing</h3>
        <div className="mt-3 space-y-3 text-sm leading-relaxed text-slate-700">
          <p>
            This wizard is a <strong>React state machine</strong>. Each of the 6 steps
            is a separate component (<code className="rounded bg-slate-200 px-1 py-0.5 text-xs">ModelPicker</code>,{' '}
            <code className="rounded bg-slate-200 px-1 py-0.5 text-xs">CoursePicker</code>,
            etc.) that updates a shared state object. The <strong>Next</strong> button
            is disabled until the current step&apos;s required fields are filled in.
          </p>
          <p>
            Step 2 (course picker) does a <strong>typeahead search</strong> over the 182
            Pomfret courses I parsed from the official 2026–2027 curriculum guide. The
            search scoring favors exact name matches over substring matches over
            description matches.
          </p>
          <p>
            When you click <strong>Generate prompt</strong>, the form values are
            validated with <strong>Zod</strong> (a TypeScript schema validation library)
            and sent as JSON to the backend. The same Zod schema runs on both sides, so
            the frontend and backend are guaranteed to agree on the shape of the data.
          </p>
        </div>
      </section>
    </main>
  );
}

// ----- Loading screen shown while Opus 4.7 composes the prompt -----

const COMPOSING_HELPER_MESSAGES = [
  'Reading your inputs',
  'Pulling Pomfret course context',
  'Calling Claude Opus 4.7',
  'Tailoring to your model',
  'Polishing the language',
];

function ComposingScreen() {
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const interval = setInterval(() => {
      setPhase((p) => (p + 1) % COMPOSING_HELPER_MESSAGES.length);
    }, 2400);
    return () => clearInterval(interval);
  }, []);

  return (
    <main className="relative flex min-h-screen flex-col items-center overflow-hidden px-6 pt-16 pb-20">
      {/* Soft orbit glow in the background */}
      <div
        aria-hidden
        className="composing-orbit-ring absolute top-32 h-[420px] w-[420px] rounded-full opacity-40 blur-3xl"
        style={{
          background:
            'conic-gradient(from 0deg, rgba(99,102,241,0.18), rgba(236,72,153,0.14), rgba(245,158,11,0.16), rgba(99,102,241,0.18))',
        }}
      />

      <div className="relative z-10 mx-auto w-full max-w-xl text-center">
        <h1 className="composing-text font-serif text-6xl italic leading-[1.25] tracking-tight pb-3 sm:text-7xl sm:pb-4">
          composing
          <span className="composing-dot composing-dot-1">.</span>
          <span className="composing-dot composing-dot-2">.</span>
          <span className="composing-dot composing-dot-3">.</span>
        </h1>

        <p
          key={phase}
          className="composing-helper mt-8 pl-[0.2em] text-sm font-medium uppercase tracking-[0.2em] text-slate-500"
        >
          {COMPOSING_HELPER_MESSAGES[phase]}
        </p>

        <p className="mt-6 text-xs leading-relaxed text-slate-400">
          Opus 4.7 is writing all seven sections of your prompt. This usually takes
          about ten seconds.
        </p>
      </div>

      <div className="relative z-10 mt-16 w-full max-w-2xl">
        <RagPanel eyebrow="While we wait — the RAG learning system" />
      </div>
    </main>
  );
}
