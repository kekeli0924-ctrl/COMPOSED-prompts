import { describe, it, expect } from 'vitest';
import { computeDashboardStats } from '@/lib/dashboard-stats';

const e = (createdAt: string, assessmentDate: string | null = null) =>
  ({ createdAt, assessmentDate } as any);

describe('computeDashboardStats', () => {
  it('counts prompts from total, not the page size', () => {
    const s = computeDashboardStats([e('2026-05-31T10:00:00Z')], 42, new Date('2026-05-31T12:00:00Z'));
    expect(s.promptsMade).toBe(42);
  });

  it('day streak counts consecutive days ending today', () => {
    const now = new Date('2026-05-31T12:00:00Z');
    const entries = [e('2026-05-31T09:00:00Z'), e('2026-05-30T09:00:00Z'), e('2026-05-29T09:00:00Z'), e('2026-05-27T09:00:00Z')];
    expect(computeDashboardStats(entries, 4, now).dayStreak).toBe(3);
  });

  it('day streak still counts when the most recent day is yesterday', () => {
    const now = new Date('2026-05-31T12:00:00Z');
    const entries = [e('2026-05-30T09:00:00Z'), e('2026-05-29T09:00:00Z')];
    expect(computeDashboardStats(entries, 2, now).dayStreak).toBe(2);
  });

  it('day streak is 0 when newest activity is older than yesterday', () => {
    const now = new Date('2026-05-31T12:00:00Z');
    expect(computeDashboardStats([e('2026-05-25T09:00:00Z')], 1, now).dayStreak).toBe(0);
  });

  it('next assessment is the soonest future date', () => {
    const now = new Date('2026-05-31T12:00:00Z');
    const entries = [e('2026-05-31T09:00:00Z', '2026-06-20'), e('2026-05-30T09:00:00Z', '2026-06-05'), e('2026-05-29T09:00:00Z', '2026-05-01')];
    expect(computeDashboardStats(entries, 3, now).nextAssessment).toBe('2026-06-05');
  });

  it('next assessment is null when none are in the future', () => {
    const now = new Date('2026-05-31T12:00:00Z');
    expect(computeDashboardStats([e('2026-05-29T09:00:00Z', '2026-05-01')], 1, now).nextAssessment).toBeNull();
  });
});
