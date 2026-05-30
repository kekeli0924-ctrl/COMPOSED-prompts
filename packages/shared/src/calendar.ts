export type Interval = { start: string; end: string }; // ISO 8601 strings

// Merge busy intervals (clipped to the window), then return the gaps that are
// at least minBlockMinutes long within [windowStart, windowEnd]. Timezone-agnostic:
// callers render the ISO times in the student's local time.
export function computeFreeBlocks(
  busy: Interval[],
  windowStart: string,
  windowEnd: string,
  minBlockMinutes: number,
): Interval[] {
  const winStart = new Date(windowStart).getTime();
  const winEnd = new Date(windowEnd).getTime();
  const minMs = minBlockMinutes * 60 * 1000;

  const clipped = busy
    .map((b) => ({
      start: Math.max(new Date(b.start).getTime(), winStart),
      end: Math.min(new Date(b.end).getTime(), winEnd),
    }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start - b.start);

  const merged: Array<{ start: number; end: number }> = [];
  for (const b of clipped) {
    const last = merged[merged.length - 1];
    if (last && b.start <= last.end) last.end = Math.max(last.end, b.end);
    else merged.push({ ...b });
  }

  const free: Interval[] = [];
  let cursor = winStart;
  for (const b of merged) {
    if (b.start - cursor >= minMs) {
      free.push({ start: new Date(cursor).toISOString(), end: new Date(b.start).toISOString() });
    }
    cursor = Math.max(cursor, b.end);
  }
  if (winEnd - cursor >= minMs) {
    free.push({ start: new Date(cursor).toISOString(), end: new Date(winEnd).toISOString() });
  }
  return free;
}
