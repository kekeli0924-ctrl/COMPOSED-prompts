import { describe, it, expect, beforeEach } from 'vitest';
import {
  saveHistoryEntry,
  listHistory,
  rateHistoryEntry,
  clearHistory,
  MAX_HISTORY,
  redactMaterialForHistory,
} from '@/lib/storage/history';

describe('history storage', () => {
  beforeEach(() => {
    clearHistory();
  });

  it('starts empty', () => {
    expect(listHistory()).toEqual([]);
  });

  it('saves and lists entries newest-first', async () => {
    const e1 = await saveHistoryEntry({
      promptText: 'p1',
      llm: 'anthropic',
      model: 'claude-opus-4-7',
      mode: 'cram-review',
      courseId: 'x',
    });
    const e2 = await saveHistoryEntry({
      promptText: 'p2',
      llm: 'anthropic',
      model: 'claude-opus-4-7',
      mode: 'cram-review',
      courseId: 'y',
    });
    const all = listHistory();
    expect(all.length).toBe(2);
    expect(all[0]!.id).toBe(e2.id);
    expect(all[1]!.id).toBe(e1.id);
  });

  it('caps history at MAX_HISTORY (LRU)', async () => {
    for (let i = 0; i < MAX_HISTORY + 5; i++) {
      await saveHistoryEntry({
        promptText: `p${i}`,
        llm: 'anthropic',
        model: 'claude-opus-4-7',
        mode: 'cram-review',
        courseId: 'x',
      });
    }
    expect(listHistory().length).toBe(MAX_HISTORY);
  });

  it('stores a rating on an existing entry', async () => {
    const entry = await saveHistoryEntry({
      promptText: 'p',
      llm: 'anthropic',
      model: 'claude-opus-4-7',
      mode: 'cram-review',
      courseId: null,
    });
    rateHistoryEntry(entry.id, 5, 'great');
    const refreshed = listHistory().find((e) => e.id === entry.id);
    expect(refreshed?.rating).toBe(5);
    expect(refreshed?.ratingText).toBe('great');
  });
});

describe('redactMaterialForHistory', () => {
  it('redacts xml-format material', () => {
    const input = '<role>tutor</role>\n\n<material>SECRET NOTES</material>\n\n<goal>study</goal>';
    const out = redactMaterialForHistory(input);
    expect(out).not.toContain('SECRET NOTES');
    expect(out).toContain('[material redacted');
    expect(out).toContain('<role>tutor</role>');
    expect(out).toContain('<goal>study</goal>');
  });

  it('redacts markdown-format material', () => {
    const input = '## ROLE\n\ntutor\n\n## MATERIAL\n\nSECRET NOTES\n\n## GOAL\n\nstudy';
    const out = redactMaterialForHistory(input);
    expect(out).not.toContain('SECRET NOTES');
  });
});
