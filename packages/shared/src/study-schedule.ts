export type StudyBlock = { start: string; end: string };
// Local datetime strings, e.g. '2026-06-12T19:00:00' — no 'Z', no timezone offset.

const pad = (n: number): string => String(n).padStart(2, '0');

// Format a Date's LOCAL components as 'YYYY-MM-DDTHH:mm:ss'.
function toLocalIso(d: Date): string {
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const MAX_REVIEW_DAYS = 6;
const GAP_EXPONENT = 1.4; // >1 ⇒ review days cluster early and spread out toward the test.

// Pick review-day OFFSETS (whole days from today) with gaps that WIDEN toward the test.
// `windowDays` = whole days from today to the assessment day (offset 0 = today,
// offset windowDays-1 = the day before the test). `sessionCount` caps the number of
// review days — no point scheduling more review days than there are sessions.
// Distributed practice: fewer, well-spaced reviews beat the same hours crammed into
// consecutive days (which is what the old even round-robin produced).
function reviewDayOffsets(windowDays: number, sessionCount: number): number[] {
  if (windowDays <= 1) return [0]; // test today/tomorrow/past → cram today
  const r = Math.max(
    1,
    Math.min(1 + Math.round(Math.log2(windowDays)), sessionCount, windowDays, MAX_REVIEW_DAYS),
  );
  if (r <= 1) return [0];
  const last = windowDays - 1;
  const raw: number[] = [];
  for (let i = 0; i < r; i++) {
    raw.push(Math.round(last * Math.pow(i / (r - 1), GAP_EXPONENT)));
  }
  // `raw` is non-decreasing (convex curve, exponent > 1). The Set is defensive: it
  // makes the strictly-increasing postcondition unconditional in case rounding ever
  // collided on a tiny window. (It doesn't across realistic inputs, but the guard is cheap.)
  return [...new Set(raw)];
}

export function proposeStudyBlocks(input: {
  assessmentDate: string; // 'yyyy-mm-dd'
  hoursAvailable: number;
  now?: Date;
}): StudyBlock[] {
  const now = input.now ?? new Date();
  const totalMinutes = Math.round(input.hoursAvailable * 60);
  if (totalMinutes <= 0) return [];

  // 1. Split into <=60-min sessions (final one shorter for the remainder).
  const sessions: number[] = [];
  let remaining = totalMinutes;
  while (remaining > 0) {
    const d = Math.min(60, remaining);
    sessions.push(d);
    remaining -= d;
  }

  // 2. Choose review days at EXPANDING gaps across [today .. day-before-assessment].
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [ay, am, ad] = input.assessmentDate.split('-').map(Number);
  const assessmentDay = new Date(ay ?? 1970, (am ?? 1) - 1, ad ?? 1); // local midnight
  const windowDays = Math.round((assessmentDay.getTime() - startOfToday.getTime()) / MS_PER_DAY);
  const days: Date[] = reviewDayOffsets(windowDays, sessions.length).map((off) => {
    const d = new Date(startOfToday);
    d.setDate(d.getDate() + off);
    return d;
  });

  // 3. Round-robin sessions across the chosen review days.
  const perDay: number[][] = days.map(() => []);
  sessions.forEach((dur, i) => {
    perDay[i % days.length]!.push(dur);
  });

  // 4. Place each day's sessions starting at 19:00 (or the next top-of-hour after
  // `now` if today and 7 PM has passed), stacking back-to-back.
  const blocks: StudyBlock[] = [];
  days.forEach((day, di) => {
    const durations = perDay[di]!;
    if (durations.length === 0) return;

    const firstStart = new Date(day);
    firstStart.setHours(19, 0, 0, 0);
    // If 7 PM has already passed today, bump to the next top-of-hour after `now`.
    // Late at night this can roll today's sessions past midnight onto the next
    // calendar date — acceptable, since the schedule is editable downstream.
    if (sameDay(day, now) && now.getTime() >= firstStart.getTime()) {
      const next = new Date(now);
      next.setMinutes(0, 0, 0);
      next.setHours(next.getHours() + 1);
      firstStart.setTime(next.getTime());
    }

    let cursorTime = new Date(firstStart);
    for (const dur of durations) {
      const start = new Date(cursorTime);
      const end = new Date(start.getTime() + dur * 60 * 1000);
      blocks.push({ start: toLocalIso(start), end: toLocalIso(end) });
      cursorTime = end;
    }
  });

  return blocks;
}
