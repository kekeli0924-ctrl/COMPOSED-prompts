import { describe, it, expect } from 'vitest';
import { proposeStudyBlocks, type StudyBlock } from '@composed-prompts/shared';

// new Date(year, monthIndex, day, h, m, s) is LOCAL time; the function reads/writes
// local components, so these assertions are timezone-independent.
const at = (y: number, mo: number, d: number, h = 8, mi = 0) => new Date(y, mo - 1, d, h, mi, 0);

const dates = (blocks: StudyBlock[]): string[] => blocks.map((b) => b.start.slice(0, 10));
const minutes = (b: StudyBlock): number => {
  const ms = (iso: string): number => {
    const [d, t] = iso.split('T');
    const [y, mo, da] = d!.split('-').map(Number);
    const [h, mi, s] = t!.split(':').map(Number);
    return new Date(y!, mo! - 1, da!, h!, mi!, s!).getTime();
  };
  return Math.round((ms(b.end) - ms(b.start)) / 60000);
};
// Distinct whole-day offsets from start-of-`now`, in block order.
const dayOffsets = (blocks: StudyBlock[], now: Date): number[] => {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const out: number[] = [];
  for (const b of blocks) {
    const [y, mo, d] = b.start.slice(0, 10).split('-').map(Number);
    const off = Math.round((new Date(y!, mo! - 1, d!).getTime() - start) / 86400000);
    if (!out.includes(off)) out.push(off);
  }
  return out;
};

describe('proposeStudyBlocks', () => {
  it('returns [] for zero or negative hours', () => {
    expect(proposeStudyBlocks({ assessmentDate: '2026-06-10', hoursAvailable: 0, now: at(2026, 6, 1) })).toEqual([]);
  });

  it('splits into <=60-min sessions with a shorter remainder', () => {
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-10', hoursAvailable: 2.5, now: at(2026, 6, 1) });
    expect(blocks.length).toBe(3);
    expect(blocks[0]).toEqual({ start: '2026-06-01T19:00:00', end: '2026-06-01T20:00:00' });
    // remainder session is 30 min; here (one session per review day) it lands on the
    // last review day — the day before the test.
    expect(blocks[2]).toEqual({ start: '2026-06-09T19:00:00', end: '2026-06-09T19:30:00' });
  });

  it('places review days at expanding gaps, last one the day before the test', () => {
    // Test in 14 days with 5 one-hour sessions → one session per review day on
    // days 0, 2, 5, 9, 13 (gaps 2,3,4,4 — widening), last = the day before the test.
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-15', hoursAvailable: 5, now: at(2026, 6, 1) });
    expect(dates(blocks)).toEqual(['2026-06-01', '2026-06-03', '2026-06-06', '2026-06-10', '2026-06-14']);
    blocks.forEach((b) => expect(b.start.slice(11)).toBe('19:00:00'));
    blocks.forEach((b) => expect(minutes(b)).toBe(60));
  });

  it('widens gaps monotonically and ends the day before the test', () => {
    const now = at(2026, 6, 1);
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-15', hoursAvailable: 5, now });
    const offs = dayOffsets(blocks, now);
    for (let i = 1; i < offs.length; i++) expect(offs[i]!).toBeGreaterThan(offs[i - 1]!); // strictly increasing
    const gaps = offs.slice(1).map((o, i) => o - offs[i]!);
    for (let i = 1; i < gaps.length; i++) expect(gaps[i]!).toBeGreaterThanOrEqual(gaps[i - 1]!); // expanding
    expect(offs[offs.length - 1]).toBe(13); // Jun 15 test → last review offset 13 (Jun 14)
  });

  it('caps review days at 6 even for a long horizon with many hours', () => {
    // 10 hours (10 sessions) toward a test ~100 days out → at most 6 distinct review days.
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-09-09', hoursAvailable: 10, now: at(2026, 6, 1) });
    const distinct = new Set(dates(blocks));
    expect(distinct.size).toBeLessThanOrEqual(6);
    expect(distinct.size).toBeGreaterThan(1);
  });

  it('preserves total study minutes and keeps every block <=60 min', () => {
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-15', hoursAvailable: 5, now: at(2026, 6, 1) });
    expect(blocks.reduce((s, b) => s + minutes(b), 0)).toBe(300);
    blocks.forEach((b) => expect(minutes(b)).toBeLessThanOrEqual(60));
  });

  it('schedules a lone session the day before the test (single-session, long horizon)', () => {
    // 1 hour = one session; test 14 days out → the single review lands the day before
    // the test (Jun 14), honoring the "review before the test" promise — not today.
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-15', hoursAvailable: 1, now: at(2026, 6, 1) });
    expect(blocks).toEqual([{ start: '2026-06-14T19:00:00', end: '2026-06-14T20:00:00' }]);
  });

  it('crams everything today when the assessment is today, stacking back-to-back', () => {
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-01', hoursAvailable: 2, now: at(2026, 6, 1) });
    expect(blocks).toEqual([
      { start: '2026-06-01T19:00:00', end: '2026-06-01T20:00:00' },
      { start: '2026-06-01T20:00:00', end: '2026-06-01T21:00:00' },
    ]);
  });

  it("starts today's blocks at the next hour when 7 PM has already passed", () => {
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-01', hoursAvailable: 1, now: at(2026, 6, 1, 21, 30) });
    expect(blocks).toEqual([{ start: '2026-06-01T22:00:00', end: '2026-06-01T23:00:00' }]);
  });

  it('crams today (no crash) when the assessment date is in the past', () => {
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-01', hoursAvailable: 1, now: at(2026, 6, 5) });
    expect(blocks).toEqual([{ start: '2026-06-05T19:00:00', end: '2026-06-05T20:00:00' }]);
  });

  it('stacks multiple sessions per day when sessions exceed available review days', () => {
    // 3 sessions, test in 2 days → review days Jun 1 & Jun 2; Jun 1 gets two back-to-back.
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-03', hoursAvailable: 3, now: at(2026, 6, 1) });
    expect(blocks).toEqual([
      { start: '2026-06-01T19:00:00', end: '2026-06-01T20:00:00' },
      { start: '2026-06-01T20:00:00', end: '2026-06-01T21:00:00' },
      { start: '2026-06-02T19:00:00', end: '2026-06-02T20:00:00' },
    ]);
  });
});
