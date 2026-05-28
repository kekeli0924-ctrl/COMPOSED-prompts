'use client';

import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import type { StudyMode } from '@/lib/types';
import { STUDY_MODE_LABELS, STUDY_MODE_DESCRIPTIONS } from '@/lib/templates';

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
    <RadioGroup
      value={props.value ?? ''}
      onValueChange={(v) => props.onChange(v as StudyMode)}
      className="grid gap-3"
    >
      {MODES.map((m) => (
        <div key={m} className="flex items-start gap-3 rounded border bg-white p-3">
          <RadioGroupItem value={m} id={m} className="mt-1" />
          <Label htmlFor={m} className="flex-1 cursor-pointer">
            <div className="font-medium">{STUDY_MODE_LABELS[m]}</div>
            <div className="text-sm text-slate-600">{STUDY_MODE_DESCRIPTIONS[m]}</div>
          </Label>
        </div>
      ))}
    </RadioGroup>
  );
}
