import { describe, it, expect } from 'vitest';
import { groupHistoryByClass } from '@/lib/group-history';
import { findCourse } from '@composed-prompts/shared';

const e = (id: string, courseId: string | null, createdAt: number) => ({ id, courseId, createdAt });

describe('groupHistoryByClass', () => {
  it('returns [] for no entries', () => {
    expect(groupHistoryByClass([])).toEqual([]);
  });

  it('groups entries by courseId with a count', () => {
    const groups = groupHistoryByClass([
      e('a', 'science-biology', 200),
      e('b', 'science-biology', 100),
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe('science-biology');
    expect(groups[0]!.count).toBe(2);
    expect(groups[0]!.entries.map((x) => x.id)).toEqual(['a', 'b']);
    expect(groups[0]!.label).toBe(findCourse('science-biology')?.name ?? 'science-biology');
  });

  it('puts null-courseId entries in a single "Other" group labeled Other', () => {
    const groups = groupHistoryByClass([e('a', null, 100), e('b', null, 50)]);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.key).toBe('other');
    expect(groups[0]!.label).toBe('Other');
    expect(groups[0]!.count).toBe(2);
  });

  it('orders groups by most-recent activity, with Other always last', () => {
    const groups = groupHistoryByClass([
      e('old', 'science-biology', 100),
      e('new', 'arts-acting-and-improv', 300),
      e('other-newest', null, 999),
    ]);
    expect(groups.map((g) => g.key)).toEqual(['arts-acting-and-improv', 'science-biology', 'other']);
  });
});
