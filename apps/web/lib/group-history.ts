import { findCourse } from '@composed-prompts/shared';

export type HistoryGroup<T> = { key: string; label: string; count: number; entries: T[] };

const OTHER = 'other';

export function groupHistoryByClass<T extends { courseId: string | null; createdAt: number }>(
  entries: T[],
): HistoryGroup<T>[] {
  const buckets = new Map<string, T[]>();
  for (const entry of entries) {
    const key = entry.courseId ?? OTHER;
    const bucket = buckets.get(key);
    if (bucket) bucket.push(entry);
    else buckets.set(key, [entry]);
  }

  const groups: HistoryGroup<T>[] = [...buckets.entries()].map(([key, es]) => ({
    key,
    label: key === OTHER ? 'Other' : findCourse(key)?.name ?? key,
    count: es.length,
    entries: es,
  }));

  groups.sort((a, b) => {
    if (a.key === OTHER) return 1;
    if (b.key === OTHER) return -1;
    const aNewest = Math.max(...a.entries.map((x) => x.createdAt));
    const bNewest = Math.max(...b.entries.map((x) => x.createdAt));
    return bNewest - aNewest;
  });

  return groups;
}
