import type { HistoryEntry } from '@composed-prompts/shared';

export type DashboardStats = {
  promptsMade: number;
  dayStreak: number;
  nextAssessment: string | null; // ISO 'YYYY-MM-DD'
};

const dayKey = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function computeDashboardStats(
  entries: Pick<HistoryEntry, 'createdAt' | 'assessmentDate'>[],
  total: number,
  now: Date,
): DashboardStats {
  const days = new Set(entries.map((e) => dayKey(new Date(e.createdAt))));
  let streak = 0;
  const cursor = new Date(now);
  if (!days.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1);
  while (days.has(dayKey(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  const todayKey = dayKey(now);
  const future = entries
    .map((e) => e.assessmentDate)
    .filter((d): d is string => !!d && d > todayKey)
    .sort();
  const nextAssessment = future[0] ?? null;

  return { promptsMade: total, dayStreak: streak, nextAssessment };
}
