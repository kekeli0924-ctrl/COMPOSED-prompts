import { describe, it, expect, vi } from 'vitest';
import { WizardInputsSchema } from '@composed-prompts/shared';
import { runEval, buildSummaryMarkdown, RUBRIC_CRITERIA, type EvalDeps, type GradeResult } from '../../scripts/eval-prompts.js';
import { EVAL_FIXTURES } from '../../scripts/eval-fixtures.js';

const fakeGrade = (total: number): GradeResult => ({
  scores: Object.fromEntries(RUBRIC_CRITERIA.map((c) => [c, 4])),
  total,
  notes: 'fine',
});

describe('EVAL_FIXTURES — coverage required by the plan', () => {
  it('has ~16 fixtures spanning all 5 modes', () => {
    expect(EVAL_FIXTURES.length).toBeGreaterThanOrEqual(16);
    const modes = new Set(EVAL_FIXTURES.map((f) => f.inputs.mode));
    expect([...modes].sort()).toEqual([
      'concept-clarification', 'cram-review', 'essay-project', 'multi-day-plan', 'practice-questions',
    ]);
  });

  it('covers the required variation axes', () => {
    expect(EVAL_FIXTURES.some((f) => f.inputs.confidence === undefined)).toBe(true); // unset confidence
    expect(EVAL_FIXTURES.some((f) => f.inputs.confidence !== undefined)).toBe(true);
    expect(EVAL_FIXTURES.some((f) => f.inputs.material)).toBe(true); // with material
    expect(EVAL_FIXTURES.some((f) => !f.inputs.material)).toBe(true); // without
    expect(EVAL_FIXTURES.some((f) => f.inputs.courseId === null && f.inputs.courseFreeText)).toBe(true); // free-text course
    expect(EVAL_FIXTURES.some((f) => f.inputs.courseId !== null)).toBe(true); // catalog course
    const dates = EVAL_FIXTURES.map((f) => f.inputs.assessmentDate).sort();
    expect(dates[0]! < '2026-06-20').toBe(true); // near
    expect(dates[dates.length - 1]! > '2026-08-01').toBe(true); // far
  });

  it('every fixture is a VALID generate request (passes the real Zod schema)', () => {
    for (const f of EVAL_FIXTURES) {
      const parsed = WizardInputsSchema.safeParse(f.inputs);
      expect(parsed.success, `${f.name}: ${parsed.success ? '' : JSON.stringify(parsed.error.issues)}`).toBe(true);
    }
  });

  it('fixture names are unique (they become output filenames)', () => {
    const names = EVAL_FIXTURES.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });
});

describe('runEval — end-to-end with mocked deps (no API, no money)', () => {
  it('runs fixtures x versions, grades successes, and summarizes', async () => {
    const generateFn = vi.fn(async () => ({ ok: true as const, prompt: 'PROMPT TEXT' }));
    const gradeFn = vi.fn(async (_p: string, _f, version: string) => fakeGrade(version === 'v2' ? 36 : 30));
    const deps: EvalDeps = { generateFn, gradeFn };

    const { rows, summaryMarkdown } = await runEval({ versions: ['v1', 'v2'], fixtures: EVAL_FIXTURES }, deps);

    expect(rows).toHaveLength(EVAL_FIXTURES.length * 2);
    expect(generateFn).toHaveBeenCalledTimes(EVAL_FIXTURES.length * 2);
    expect(gradeFn).toHaveBeenCalledTimes(EVAL_FIXTURES.length * 2);
    expect(summaryMarkdown).toContain('| v1 |');
    expect(summaryMarkdown).toContain('| v2 |');
    expect(summaryMarkdown).toContain('36.00'); // v2 mean
    expect(summaryMarkdown).toContain('30.00'); // v1 mean
    for (const c of RUBRIC_CRITERIA) expect(summaryMarkdown).toContain(`| ${c} |`);
    expect(summaryMarkdown).toContain('| cram-review |'); // per-mode breakdown
  });

  it('a failed generation becomes ok:false, is never graded, and is excluded from means', async () => {
    const fixtures = EVAL_FIXTURES.slice(0, 3);
    const generateFn = vi
      .fn(async () => ({ ok: true as const, prompt: 'P' }))
      .mockResolvedValueOnce({ ok: false as const }); // first call fails
    const gradeFn = vi.fn(async () => fakeGrade(40));

    const { rows, summaryMarkdown } = await runEval({ versions: ['v2'], fixtures }, { generateFn, gradeFn });

    expect(rows.filter((r) => !r.ok)).toHaveLength(1);
    expect(gradeFn).toHaveBeenCalledTimes(2); // only successes graded
    expect(summaryMarkdown).toContain('| v2 | 2 | 1 | 0 |'); // graded=2, failed=1, ungradeable=0
    expect(summaryMarkdown).toContain('40.00'); // mean over successes only
  });

  it('UNGRADEABLE rows (empty scores) are excluded from means, not counted as zero', async () => {
    const fixtures = EVAL_FIXTURES.slice(0, 2);
    const generateFn = vi.fn(async () => ({ ok: true as const, prompt: 'P' }));
    const gradeFn = vi
      .fn(async () => fakeGrade(40))
      .mockResolvedValueOnce({ scores: {}, total: 0, notes: 'ungradeable response: blah' });

    const { summaryMarkdown } = await runEval({ versions: ['v2'], fixtures }, { generateFn, gradeFn });
    expect(summaryMarkdown).toContain('| v2 | 1 | 0 | 1 |'); // 1 graded, 0 failed, 1 ungradeable
    expect(summaryMarkdown).toContain('40.00'); // NOT 20.00 — the zero never entered the mean
  });

  it('buildSummaryMarkdown handles an all-failed run without dividing by zero', () => {
    const md = buildSummaryMarkdown([
      { fixture: 'x', mode: 'cram-review', version: 'v1', ok: false },
    ]);
    expect(md).toContain('| v1 | 0 | 1 | 0 | 0.00 |');
  });
});
