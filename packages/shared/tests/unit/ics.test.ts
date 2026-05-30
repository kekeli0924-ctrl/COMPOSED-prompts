import { describe, it, expect } from 'vitest';
import { buildIcs, type StudyBlock } from '@composed-prompts/shared';

const BLOCKS: StudyBlock[] = [
  { start: '2026-06-12T19:00:00', end: '2026-06-12T20:00:00' },
  { start: '2026-06-13T19:00:00', end: '2026-06-13T19:30:00' },
];

describe('buildIcs', () => {
  it('wraps events in a VCALENDAR with one VEVENT per block', () => {
    const ics = buildIcs(BLOCKS, { courseLabel: 'Biology', assessmentType: 'test' });
    expect(ics).toContain('BEGIN:VCALENDAR');
    expect(ics).toContain('VERSION:2.0');
    expect(ics).toContain('END:VCALENDAR');
    expect(ics.match(/BEGIN:VEVENT/g)?.length).toBe(2);
  });

  it('emits floating local DTSTART/DTEND (no Z)', () => {
    const ics = buildIcs(BLOCKS, { courseLabel: 'Biology', assessmentType: 'test' });
    expect(ics).toContain('DTSTART:20260612T190000');
    expect(ics).toContain('DTEND:20260612T200000');
    expect(ics).not.toMatch(/DTSTART:[0-9T]+Z/);
  });

  it('includes a 10-minute VALARM per event', () => {
    const ics = buildIcs(BLOCKS, { courseLabel: 'Biology', assessmentType: 'test' });
    expect(ics.match(/BEGIN:VALARM/g)?.length).toBe(2);
    expect(ics).toContain('TRIGGER:-PT10M');
  });

  it('escapes commas in the summary and gives each event a unique UID', () => {
    const ics = buildIcs(BLOCKS, { courseLabel: 'Math, Science', assessmentType: 'test' });
    expect(ics).toContain('Math\\, Science');
    const uids = [...ics.matchAll(/UID:(.+)/g)].map((m) => m[1]);
    expect(new Set(uids).size).toBe(2);
  });

  it('uses CRLF line endings', () => {
    const ics = buildIcs(BLOCKS, { courseLabel: 'Biology', assessmentType: 'test' });
    expect(ics).toContain('\r\n');
  });

  it('escapes semicolons in the summary', () => {
    const ics = buildIcs(BLOCKS, { courseLabel: 'Bio; Honors', assessmentType: 'test' });
    expect(ics).toContain('Bio\\; Honors');
  });
});
