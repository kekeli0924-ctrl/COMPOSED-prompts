import { describe, it, expect } from 'vitest';
import {
  MATERIAL_KIND_LABELS,
  MATERIAL_KINDS,
  describeAttachedKinds,
} from '@composed-prompts/shared';

describe('material-kinds', () => {
  it('has a non-empty label for every kind', () => {
    expect(MATERIAL_KINDS.length).toBe(6);
    for (const k of MATERIAL_KINDS) {
      expect(MATERIAL_KIND_LABELS[k]).toBeTruthy();
    }
  });

  it('describes a kind list in prose', () => {
    expect(describeAttachedKinds([])).toBe('');
    expect(describeAttachedKinds(['study-guide'])).toBe('study guide');
    expect(describeAttachedKinds(['study-guide', 'past-quiz'])).toBe(
      'study guide and past quiz/test',
    );
    expect(describeAttachedKinds(['study-guide', 'past-quiz', 'slides'])).toBe(
      'study guide, past quiz/test, and slides',
    );
  });
});
