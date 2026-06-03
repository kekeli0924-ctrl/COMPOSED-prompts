'use client';

import { useCallback, useState } from 'react';
import { proposeStudyBlocks, buildIcs, type StudyBlock } from '@composed-prompts/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Props = {
  assessmentDate: string; // 'yyyy-mm-dd'
  hoursAvailable: number;
  courseLabel: string;
  assessmentType: string;
};

const LENGTHS = [
  { label: '30 min', minutes: 30 },
  { label: '45 min', minutes: 45 },
  { label: '1 hour', minutes: 60 },
  { label: '1.5 hours', minutes: 90 },
  { label: '2 hours', minutes: 120 },
];

const datePart = (iso: string): string => iso.slice(0, 10); // yyyy-mm-dd
const timePart = (iso: string): string => iso.slice(11, 16); // hh:mm

const localMs = (iso: string): number => {
  const [d, t] = iso.split('T');
  const [y, mo, da] = d!.split('-').map(Number);
  const [h, mi] = t!.split(':').map(Number);
  return new Date(y!, mo! - 1, da!, h!, mi!).getTime();
};

const pad = (n: number): string => String(n).padStart(2, '0');
const fmt = (ms: number): string => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00`;
};
const makeIso = (date: string, time: string): string => `${date}T${time}:00`;
const addMin = (iso: string, min: number): string => fmt(localMs(iso) + min * 60000);
const durationMin = (b: StudyBlock): number => Math.round((localMs(b.end) - localMs(b.start)) / 60000);

export function StudySchedule({ assessmentDate, hoursAvailable, courseLabel, assessmentType }: Props) {
  const [blocks, setBlocks] = useState<StudyBlock[]>(() => proposeStudyBlocks({ assessmentDate, hoursAvailable }));

  const reset = useCallback(() => {
    setBlocks(proposeStudyBlocks({ assessmentDate, hoursAvailable }));
  }, [assessmentDate, hoursAvailable]);

  const updateBlock = (i: number, date: string, time: string, min: number): void => {
    setBlocks((prev) =>
      prev.map((b, j) => (j === i ? { start: makeIso(date, time), end: addMin(makeIso(date, time), min) } : b)),
    );
  };

  const removeBlock = (i: number): void => setBlocks((prev) => prev.filter((_, j) => j !== i));

  const addBlock = (): void => {
    setBlocks((prev) => {
      const last = prev[prev.length - 1];
      const baseDate = last ? datePart(addMin(last.start, 24 * 60)) : assessmentDate;
      const startIso = `${baseDate}T19:00:00`;
      return [...prev, { start: startIso, end: addMin(startIso, 60) }];
    });
  };

  const download = (): void => {
    const ics = buildIcs(blocks, { courseLabel, assessmentType });
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `composed-study-${assessmentType.replace(/\s+/g, '-')}.ics`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const isPast = (() => {
    const [y, m, d] = assessmentDate.split('-').map(Number);
    const a = new Date(y!, m! - 1, d!);
    const now = new Date();
    return a < new Date(now.getFullYear(), now.getMonth(), now.getDate());
  })();

  return (
    <div className="rounded-2xl border border-border bg-card p-6">
      <h2 className="font-serif text-xl text-foreground">Plan your study sessions</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        A suggested schedule for your {hoursAvailable} hour{hoursAvailable === 1 ? '' : 's'} before {assessmentDate}.
        Edit anything, then add it to your calendar.
      </p>
      {isPast && (
        <p className="mt-2 text-xs text-amber-700">That date has passed — these are scheduled for today.</p>
      )}

      {blocks.length === 0 ? (
        <p className="mt-4 text-sm text-muted-foreground">No sessions. Add one below.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {blocks.map((b, i) => (
            <li
              key={i}
              className="flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-muted/40 px-3 py-2 text-sm"
            >
              <span className="w-full text-xs font-medium text-muted-foreground">
                Review {i + 1} of {blocks.length}
              </span>
              <Input
                type="date"
                value={datePart(b.start)}
                onChange={(e) => updateBlock(i, e.target.value, timePart(b.start), durationMin(b))}
                className="h-8 w-auto"
              />
              <Input
                type="time"
                value={timePart(b.start)}
                onChange={(e) => updateBlock(i, datePart(b.start), e.target.value, durationMin(b))}
                className="h-8 w-auto"
              />
              <select
                value={durationMin(b)}
                onChange={(e) => updateBlock(i, datePart(b.start), timePart(b.start), Number(e.target.value))}
                className="h-8 rounded-xl border border-input bg-transparent px-2 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label="Session length"
              >
                {LENGTHS.map((l) => (
                  <option key={l.minutes} value={l.minutes}>{l.label}</option>
                ))}
                {!LENGTHS.some((l) => l.minutes === durationMin(b)) && (
                  <option value={durationMin(b)}>{durationMin(b)} min</option>
                )}
              </select>
              <button
                type="button"
                onClick={() => removeBlock(i)}
                className="ml-auto text-muted-foreground transition-colors hover:text-destructive"
                aria-label="Remove session"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={addBlock}>
          Add session
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={reset}>
          Reset to suggested
        </Button>
        <Button type="button" size="sm" onClick={download} disabled={blocks.length === 0}>
          Add to calendar (.ics)
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Imports into Google, Apple, or Outlook Calendar. You&apos;ll get your calendar&apos;s normal reminders.
      </p>
    </div>
  );
}
