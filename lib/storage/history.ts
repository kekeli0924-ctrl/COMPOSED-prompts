import type { StudyMode } from '@/lib/types';

export type HistoryEntry = {
  id: string;
  createdAt: number;
  promptText: string;
  llm: string;
  model: string;
  mode: StudyMode;
  courseId: string | null;
  rating?: 1 | 2 | 3 | 4 | 5;
  ratingText?: string;
};

const KEY = 'pomfret.v1.history';
export const MAX_HISTORY = 50;

// In-memory fallback used when `localStorage` is unavailable or returns a
// stub that doesn't implement Storage methods (e.g. Node 25's experimental
// built-in `localStorage` without `--localstorage-file` set, which shadows
// jsdom's implementation in some test environments).
const memoryStore = new Map<string, string>();

type StorageLike = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const memoryStorage: StorageLike = {
  getItem(key) {
    return memoryStore.has(key) ? (memoryStore.get(key) as string) : null;
  },
  setItem(key, value) {
    memoryStore.set(key, String(value));
  },
  removeItem(key) {
    memoryStore.delete(key);
  },
};

const storage = (): StorageLike => {
  if (typeof window === 'undefined') {
    return memoryStorage;
  }
  try {
    const ls = window.localStorage;
    if (
      ls &&
      typeof ls.getItem === 'function' &&
      typeof ls.setItem === 'function' &&
      typeof ls.removeItem === 'function'
    ) {
      return ls;
    }
  } catch {
    // SecurityError or similar — fall through
  }
  return memoryStorage;
};

const read = (): HistoryEntry[] => {
  const s = storage();
  try {
    const raw = s.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as HistoryEntry[];
  } catch {
    return [];
  }
};

const write = (list: HistoryEntry[]): void => {
  const s = storage();
  try {
    s.setItem(KEY, JSON.stringify(list));
  } catch {
    // quota or other; drop silently
  }
};

/**
 * Scrub the pasted `material` body out of an assembled prompt so it isn't
 * persisted in localStorage history. The wrapping structure is preserved
 * (so users can see which section was redacted) but the body is replaced
 * with a placeholder. Spec §8: pasted material is NOT persisted anywhere.
 */
export function redactMaterialForHistory(promptText: string): string {
  const REDACTED = '[material redacted — not stored locally]';
  return promptText
    // xml format: <material>...</material>
    .replace(/<material>[\s\S]*?<\/material>/g, `<material>\n${REDACTED}\n</material>`)
    // markdown format: ## MATERIAL\n\n<body>\n\n
    .replace(/(## MATERIAL\n\n)[\s\S]*?(?=\n\n## |\n\nStep \d|$)/g, `$1${REDACTED}`)
    // numbered-steps format: Step N — MATERIAL:\n<body>
    .replace(/(Step \d+ — MATERIAL:\n)[\s\S]*?(?=\n\nStep \d|\n\n## |$)/g, `$1${REDACTED}`);
}

export async function saveHistoryEntry(
  entry: Omit<HistoryEntry, 'id' | 'createdAt'>,
): Promise<HistoryEntry> {
  const full: HistoryEntry = {
    id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...entry,
    promptText: redactMaterialForHistory(entry.promptText),
  };
  const list = read();
  list.unshift(full);
  while (list.length > MAX_HISTORY) list.pop();
  write(list);
  return full;
}

export function listHistory(): HistoryEntry[] {
  return read();
}

export function rateHistoryEntry(id: string, rating: 1 | 2 | 3 | 4 | 5, text?: string): void {
  const list = read();
  const idx = list.findIndex((e) => e.id === id);
  if (idx === -1) return;
  list[idx] = { ...list[idx]!, rating, ratingText: text };
  write(list);
}

export function clearHistory(): void {
  const s = storage();
  try {
    s.removeItem(KEY);
  } catch {
    // ignore
  }
}
