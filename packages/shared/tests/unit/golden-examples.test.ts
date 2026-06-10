import { describe, it, expect } from 'vitest';
import { goldenExamplesForMode, STUDY_MODE_LABELS } from '@composed-prompts/shared';

// Guards the JSON's shape against the StudyMode union: a typo'd mode key (or a future
// sixth mode without entries) would silently delete the curated RAG floor otherwise.
describe('golden examples — every study mode has curated exemplars', () => {
  const modes = Object.keys(STUDY_MODE_LABELS);

  it('covers all five study modes with 1-2 entries each', () => {
    expect(modes).toHaveLength(5);
    for (const mode of modes) {
      const examples = goldenExamplesForMode(mode);
      expect(examples.length, mode).toBeGreaterThanOrEqual(1);
      expect(examples.length, mode).toBeLessThanOrEqual(2);
      for (const e of examples) {
        expect(e.interactionStyle.length, mode).toBeGreaterThan(50);
        expect(e.outputSpec.length, mode).toBeGreaterThan(50);
      }
    }
  });

  it('returns [] for unknown modes (tolerant)', () => {
    expect(goldenExamplesForMode('not-a-mode')).toEqual([]);
  });
});
