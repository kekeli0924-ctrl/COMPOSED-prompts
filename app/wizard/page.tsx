'use client';

import { useState } from 'react';
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
import type { WizardInputs } from '@/lib/types';
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
      router.push('/wizard/result');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'unknown error');
      setSubmitting(false);
    }
  };

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
    </main>
  );
}
