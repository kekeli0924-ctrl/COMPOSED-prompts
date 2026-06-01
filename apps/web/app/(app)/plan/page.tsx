'use client';

import { useState, type FormEvent } from 'react';
import { StudySchedule } from '@/components/StudySchedule';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

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

const today = (): string => new Date().toISOString().slice(0, 10);

export default function PlanPage() {
  const [subject, setSubject] = useState('');
  const [assessmentDate, setAssessmentDate] = useState(today());
  const [hours, setHours] = useState<number | ''>('');
  const [submitted, setSubmitted] = useState<{
    assessmentDate: string;
    hoursAvailable: number;
    courseLabel: string;
  } | null>(null);

  const build = (e: FormEvent): void => {
    e.preventDefault();
    if (hours === '') return;
    setSubmitted({ assessmentDate, hoursAvailable: hours, courseLabel: subject.trim() || 'Study' });
  };

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <h1 className="font-serif text-3xl text-foreground">Plan a study schedule</h1>
      <p className="mt-2 text-muted-foreground">
        Tell me what you&apos;re studying for and how much time you have — I&apos;ll suggest sessions you can add to
        your calendar.
      </p>

      <form onSubmit={build} className="mt-6 grid gap-4">
        <div>
          <Label htmlFor="subject">What are you studying for?</Label>
          <Input
            id="subject"
            type="text"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="e.g. Biology test"
            className="mt-1"
          />
        </div>
        <div>
          <Label htmlFor="date">When is it?</Label>
          <Input
            id="date"
            type="date"
            value={assessmentDate}
            onChange={(e) => setAssessmentDate(e.target.value)}
            className="mt-1 w-auto"
          />
        </div>
        <div>
          <Label htmlFor="hours">How much study time do you have?</Label>
          <select
            id="hours"
            value={hours === '' ? '' : String(hours)}
            onChange={(e) => setHours(e.target.value === '' ? '' : parseFloat(e.target.value))}
            className="mt-1 block rounded-xl border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
          >
            <option value="">Pick a range</option>
            {HOUR_OPTIONS.map((h) => (
              <option key={h.value} value={String(h.value)}>{h.label}</option>
            ))}
          </select>
        </div>
        <Button type="submit" disabled={hours === ''} className="justify-self-start">
          Suggest schedule
        </Button>
      </form>

      {submitted && (
        <div className="mt-8">
          {/* key remounts the component on each new submission so it re-proposes
              from the new inputs (its block state is initialized once on mount). */}
          <StudySchedule
            key={`${submitted.assessmentDate}|${submitted.hoursAvailable}|${submitted.courseLabel}`}
            assessmentDate={submitted.assessmentDate}
            hoursAvailable={submitted.hoursAvailable}
            courseLabel={submitted.courseLabel}
            assessmentType="study session"
          />
        </div>
      )}
    </main>
  );
}
