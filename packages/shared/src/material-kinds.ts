import type { MaterialKind } from './types.js';

export const MATERIAL_KIND_LABELS: Record<MaterialKind, string> = {
  'study-guide': 'Study guide',
  'class-notes': 'Class notes',
  'past-quiz': 'Past quiz/test',
  textbook: 'Textbook pages',
  slides: 'Slides',
  'problem-set': 'Problem set',
};

export const MATERIAL_KINDS = Object.keys(MATERIAL_KIND_LABELS) as MaterialKind[];

// Prose join for prompt phrasing, e.g. "study guide and past quiz/test".
export function describeAttachedKinds(kinds: MaterialKind[]): string {
  const labels = kinds.map((k) => MATERIAL_KIND_LABELS[k].toLowerCase());
  if (labels.length === 0) return '';
  if (labels.length === 1) return labels[0]!;
  if (labels.length === 2) return `${labels[0]} and ${labels[1]}`;
  return `${labels.slice(0, -1).join(', ')}, and ${labels[labels.length - 1]}`;
}
