'use client';

import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { StudyMode } from '@composed-prompts/shared';
import { STUDY_MODE_LABELS, STUDY_MODE_DESCRIPTIONS } from '@composed-prompts/shared';

const MODES: StudyMode[] = [
  'cram-review',
  'multi-day-plan',
  'practice-questions',
  'concept-clarification',
  'essay-project',
];

export function ModePicker(props: {
  value: StudyMode | undefined;
  onChange: (v: StudyMode) => void;
}) {
  return (
    <>
      <RadioGroup
        value={props.value ?? ''}
        onValueChange={(v) => props.onChange(v as StudyMode)}
        className="grid gap-3"
      >
      {MODES.map((m) => (
        <div key={m} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-3">
          <RadioGroupItem value={m} id={m} className="mt-1" />
          <Label htmlFor={m} className="flex-1 cursor-pointer">
            <div className="font-medium">{STUDY_MODE_LABELS[m]}</div>
            <div className="text-sm text-muted-foreground">{STUDY_MODE_DESCRIPTIONS[m]}</div>
          </Label>
        </div>
      ))}
      </RadioGroup>
      <p className="mt-3 text-xs text-muted-foreground">
        Tip: testing yourself beats re-reading or highlighting — every mode here builds in active recall.
      </p>
    </>
  );
}
