'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { AssessmentType } from '@/lib/types';

const HOUR_OPTIONS: Array<{ value: number; label: string }> = [
  { value: 0.5, label: '30 minutes' },
  { value: 1, label: '1 hour' },
  { value: 2, label: '2 hours' },
  { value: 4, label: '4 hours' },
  { value: 8, label: '8 hours (a full day)' },
  { value: 24, label: '1 day' },
  { value: 48, label: '2 days' },
  { value: 72, label: '3 days' },
  { value: 168, label: '1 week' },
  { value: 336, label: '2 weeks' },
];

const TYPES: Array<{ value: AssessmentType; label: string }> = [
  { value: 'test', label: 'Test' },
  { value: 'quiz', label: 'Quiz' },
  { value: 'paper', label: 'Paper / Essay' },
  { value: 'project', label: 'Project' },
  { value: 'presentation', label: 'Presentation' },
  { value: 'other', label: 'Other' },
];

export function AssessmentStep(props: {
  assessmentType: AssessmentType | undefined;
  assessmentDate: string;
  hoursAvailable: number | undefined;
  onChange: (next: { assessmentType?: AssessmentType; assessmentDate?: string; hoursAvailable?: number }) => void;
}) {
  return (
    <div className="grid gap-6">
      <div>
        <Label htmlFor="atype">What kind of assessment?</Label>
        <Select value={props.assessmentType ?? ''} onValueChange={(v) => props.onChange({ assessmentType: v as AssessmentType })}>
          <SelectTrigger id="atype" className="mt-2">
            <SelectValue placeholder="Pick one" />
          </SelectTrigger>
          <SelectContent>
            {TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label htmlFor="adate">When is it?</Label>
        <Input
          id="adate"
          type="date"
          value={props.assessmentDate}
          onChange={(e) => props.onChange({ assessmentDate: e.target.value })}
          className="mt-2"
        />
      </div>
      <div>
        <Label htmlFor="hours">How much study time do you have?</Label>
        <Select
          value={props.hoursAvailable !== undefined ? String(props.hoursAvailable) : ''}
          onValueChange={(v) => props.onChange({ hoursAvailable: parseFloat(v) })}
        >
          <SelectTrigger id="hours" className="mt-2">
            <SelectValue placeholder="Pick a range" />
          </SelectTrigger>
          <SelectContent>
            {HOUR_OPTIONS.map((h) => (
              <SelectItem key={h.value} value={String(h.value)}>{h.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
