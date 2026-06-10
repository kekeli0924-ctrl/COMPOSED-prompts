import goldenData from '../data/golden-examples.json' with { type: 'json' };

// Curated, course-agnostic exemplar snippets per study mode — the RAG floor when no
// rated student generations exist yet (small-school cold start). Hand-written to match
// the evidence-based pedagogy in the system prompt (retrieval-first, mixed formats,
// self-explanation, confidence calibration, guide-don't-tell). Browser-safe: pure data,
// same JSON-import pattern as courses.ts.
export type GoldenExample = {
  interactionStyle: string;
  outputSpec: string;
};

const GOLDEN_EXAMPLES = goldenData as Record<string, GoldenExample[]>;

// Tolerant of unknown modes (returns []) so callers don't need to guard.
export function goldenExamplesForMode(mode: string): GoldenExample[] {
  return GOLDEN_EXAMPLES[mode] ?? [];
}
