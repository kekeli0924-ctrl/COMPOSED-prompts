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

  // 2. Available days: startOfDay(now) .. day BEFORE assessmentDate.
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const [ay, am, ad] = input.assessmentDate.split('-').map(Number);
  const assessmentDay = new Date(ay ?? 1970, (am ?? 1) - 1, ad ?? 1); // local midnight

  const days: Date[] = [];
  const cursor = new Date(startOfToday);
  while (cursor < assessmentDay) {
    days.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  if (days.length === 0) days.push(new Date(startOfToday)); // cram today

  // 3. Round-robin sessions across the days.
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
