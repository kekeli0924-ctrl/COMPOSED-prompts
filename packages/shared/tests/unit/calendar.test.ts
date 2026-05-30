import { describe, it, expect } from 'vitest';
import { computeFreeBlocks } from '@composed-prompts/shared';

const W_START = '2026-06-01T00:00:00.000Z';
const W_END = '2026-06-01T10:00:00.000Z'; // 10-hour window

describe('computeFreeBlocks', () => {
  it('returns the whole window when there is no busy time', () => {
    const free = computeFreeBlocks([], W_START, W_END, 30);
    expect(free).toEqual([{ start: W_START, end: W_END }]);
  });

  it('returns the gaps around a busy block', () => {
    const busy = [{ start: '2026-06-01T03:00:00.000Z', end: '2026-06-01T05:00:00.000Z' }];
    const free = computeFreeBlocks(busy, W_START, W_END, 30);
    expect(free).toEqual([
      { start: '2026-06-01T00:00:00.000Z', end: '2026-06-01T03:00:00.000Z' },
      { start: '2026-06-01T05:00:00.000Z', end: '2026-06-01T10:00:00.000Z' },
    ]);
  });

  it('merges overlapping/adjacent busy blocks', () => {
    const busy = [
      { start: '2026-06-01T03:00:00.000Z', end: '2026-06-01T05:00:00.000Z' },
      { start: '2026-06-01T04:30:00.000Z', end: '2026-06-01T06:00:00.000Z' },
    ];
    const free = computeFreeBlocks(busy, W_START, W_END, 30);
    expect(free).toEqual([
      { start: '2026-06-01T00:00:00.000Z', end: '2026-06-01T03:00:00.000Z' },
      { start: '2026-06-01T06:00:00.000Z', end: '2026-06-01T10:00:00.000Z' },
    ]);
  });

  it('drops gaps shorter than minBlockMinutes', () => {
    const busy = [
      { start: '2026-06-01T00:20:00.000Z', end: '2026-06-01T05:00:00.000Z' }, // leaves a 20-min gap at the start
    ];
    const free = computeFreeBlocks(busy, W_START, W_END, 30);
    expect(free).toEqual([{ start: '2026-06-01T05:00:00.000Z', end: '2026-06-01T10:00:00.000Z' }]);
  });

  it('returns [] when busy covers the whole window', () => {
    const busy = [{ start: '2026-05-31T00:00:00.000Z', end: '2026-06-02T00:00:00.000Z' }];
    expect(computeFreeBlocks(busy, W_START, W_END, 30)).toEqual([]);
  });
});
