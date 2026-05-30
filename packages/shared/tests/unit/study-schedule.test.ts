import { describe, it, expect } from 'vitest';
import { proposeStudyBlocks } from '@composed-prompts/shared';

// new Date(year, monthIndex, day, h, m, s) is LOCAL time; the function reads/writes
// local components, so these assertions are timezone-independent.
const at = (y: number, mo: number, d: number, h = 8, mi = 0) => new Date(y, mo - 1, d, h, mi, 0);

describe('proposeStudyBlocks', () => {
  it('returns [] for zero or negative hours', () => {
    expect(proposeStudyBlocks({ assessmentDate: '2026-06-10', hoursAvailable: 0, now: at(2026, 6, 1) })).toEqual([]);
  });

  it('splits into <=60-min sessions with a shorter remainder', () => {
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-10', hoursAvailable: 2.5, now: at(2026, 6, 1) });
    expect(blocks.length).toBe(3);
    expect(blocks[0]).toEqual({ start: '2026-06-01T19:00:00', end: '2026-06-01T20:00:00' });
    // remainder session is 30 min on the third day
    expect(blocks[2]).toEqual({ start: '2026-06-03T19:00:00', end: '2026-06-03T19:30:00' });
  });

  it('spreads one session per day across the days before the assessment', () => {
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-05', hoursAvailable: 4, now: at(2026, 6, 1) });
    expect(blocks.map((b) => b.start.slice(0, 10))).toEqual([
      '2026-06-01', '2026-06-02', '2026-06-03', '2026-06-04',
    ]);
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

  it('stacks multiple sessions per day, in day order, when sessions exceed days', () => {
    // 3 sessions across 2 available days (Jun 1, Jun 2): day 0 gets two back-to-back.
    const blocks = proposeStudyBlocks({ assessmentDate: '2026-06-03', hoursAvailable: 3, now: at(2026, 6, 1) });
    expect(blocks).toEqual([
      { start: '2026-06-01T19:00:00', end: '2026-06-01T20:00:00' },
      { start: '2026-06-01T20:00:00', end: '2026-06-01T21:00:00' },
      { start: '2026-06-02T19:00:00', end: '2026-06-02T20:00:00' },
    ]);
  });
});
