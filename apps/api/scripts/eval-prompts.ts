// Offline prompt-eval harness — NEVER run in CI; run by hand via:
//   npx tsx scripts/eval-prompts.ts --versions v1,v2 --yes
// Generates a prompt per fixture per system-prompt version with the REAL Anthropic
// client (no DB, no budget gates, nothing persisted), grades each output with a
// cheaper model against a structural rubric, and writes raw prompts + a markdown
// summary to eval-output/<timestamp>/ (gitignored). Refuses to run without --yes
// after printing the estimated dollar cost.
//
// Workflow: before shipping any prompt change, register the new version in
// template-versions.ts + SYSTEM_PROMPTS, then run this harness old-vs-new.
import type { WizardInputs } from '@composed-prompts/shared';
import {
  SYSTEM_PROMPTS,
  generateFullPromptWithModel,
  makeClient,
  OPUS_MODEL,
} from '@composed-prompts/shared/src/generation/opus-full-prompt.js';
import type { TemplateVersionId } from '@composed-prompts/shared';
import { EVAL_FIXTURES, type EvalFixture } from './eval-fixtures.js';

// Rubric: derived from the Sharpen critique checklist + structural checks on the
// 7-section Pomfret-Study format. Each criterion scored 1-5 by the grader model.
export const RUBRIC_CRITERIA = [
  'sevenSections',          // exactly 7 sections, in order, correctly delimited
  'retrievalFirst',         // interaction style leads with recall/attempt before explanation
  'mixedFormats',           // both multiple-choice and short-answer/generative formats
  'selfExplanation',        // prompts the student to explain why/how, naming principles
  'guideDontTell',          // tutor stance: questions and hints, never giving answers away
  'confidenceScaffolding',  // scaffolding matches the student's stated confidence
  'modeCorrectOutputSpec',  // OUTPUT SPEC matches the chosen study mode's structure
  'recapSentinel',          // (v2+) literal ===COMPOSED RECAP START=== block instructions
] as const;

export type GradeResult = {
  scores: Record<string, number>;
  total: number;
  notes: string;
};

export type EvalDeps = {
  generateFn: (inputs: WizardInputs, version: TemplateVersionId) => Promise<{ ok: true; prompt: string } | { ok: false }>;
  gradeFn: (prompt: string, fixture: EvalFixture, version: TemplateVersionId) => Promise<GradeResult>;
};

export type EvalRow = {
  fixture: string;
  mode: string;
  version: TemplateVersionId;
  ok: boolean;
  prompt?: string;
  grade?: GradeResult;
};

export async function runEval(
  opts: { versions: TemplateVersionId[]; fixtures: EvalFixture[] },
  deps: EvalDeps,
): Promise<{ rows: EvalRow[]; summaryMarkdown: string }> {
  const rows: EvalRow[] = [];
  // Sequential on purpose: keeps API pressure low and output deterministic in order.
  for (const version of opts.versions) {
    for (const fixture of opts.fixtures) {
      const gen = await deps.generateFn(fixture.inputs, version);
      if (!gen.ok) {
        rows.push({ fixture: fixture.name, mode: fixture.inputs.mode, version, ok: false });
        continue;
      }
      const grade = await deps.gradeFn(gen.prompt, fixture, version);
      rows.push({ fixture: fixture.name, mode: fixture.inputs.mode, version, ok: true, prompt: gen.prompt, grade });
    }
  }
  return { rows, summaryMarkdown: buildSummaryMarkdown(rows) };
}

const mean = (ns: number[]): number => (ns.length === 0 ? 0 : ns.reduce((a, b) => a + b, 0) / ns.length);
const fmt = (n: number): string => n.toFixed(2);

export function buildSummaryMarkdown(rows: EvalRow[]): string {
  const versions = [...new Set(rows.map((r) => r.version))];
  const modes = [...new Set(rows.map((r) => r.mode))];
  // Ungradeable responses (empty scores) are EXCLUDED from every mean — counting them
  // as total=0 would silently drag a version's average down for a grader hiccup.
  const graded = rows.filter(
    (r): r is EvalRow & { grade: GradeResult } =>
      r.ok && r.grade !== undefined && Object.keys(r.grade.scores).length > 0,
  );

  const lines: string[] = ['# Prompt eval summary', ''];

  lines.push('## Mean total per version', '', '| version | graded | failed | ungradeable | mean total |', '|---|---|---|---|---|');
  for (const v of versions) {
    const g = graded.filter((r) => r.version === v);
    const failed = rows.filter((r) => r.version === v && !r.ok).length;
    const ungradeable = rows.filter(
      (r) => r.version === v && r.ok && (!r.grade || Object.keys(r.grade.scores).length === 0),
    ).length;
    lines.push(`| ${v} | ${g.length} | ${failed} | ${ungradeable} | ${fmt(mean(g.map((r) => r.grade.total)))} |`);
  }

  lines.push('', '## Mean per criterion', '', `| criterion | ${versions.join(' | ')} |`, `|---|${versions.map(() => '---').join('|')}|`);
  for (const c of RUBRIC_CRITERIA) {
    const cells = versions.map((v) =>
      fmt(mean(graded.filter((r) => r.version === v && c in r.grade.scores).map((r) => r.grade.scores[c]!))),
    );
    lines.push(`| ${c} | ${cells.join(' | ')} |`);
  }

  lines.push('', '## Mean total per mode', '', `| mode | ${versions.join(' | ')} |`, `|---|${versions.map(() => '---').join('|')}|`);
  for (const m of modes) {
    const cells = versions.map((v) => fmt(mean(graded.filter((r) => r.version === v && r.mode === m).map((r) => r.grade.total))));
    lines.push(`| ${m} | ${cells.join(' | ')} |`);
  }

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Real-client deps + CLI (only reached when executed directly, never on import).
// ---------------------------------------------------------------------------

const GRADER_SYSTEM = `You grade AI-generated study prompts for high-school students against a rubric.
Score each criterion 1-5 (5 = excellent). Criteria:
- sevenSections: exactly 7 sections (role, about_me, material, goal, interaction_style, output_spec, self_check) present in order.
- retrievalFirst: the interaction style makes the tutor open with recall/attempt and keep the student doing the thinking before explaining.
- mixedFormats: both multiple-choice AND short-answer/generative question formats are required.
- selfExplanation: the student is made to explain why/how and name underlying principles.
- guideDontTell: the tutor must not give away answers; it asks questions and guides the student to discover mistakes.
- confidenceScaffolding: scaffolding amount matches the student's stated confidence (more support when low, more challenge when high; neutral default when unset).
- modeCorrectOutputSpec: the OUTPUT SPEC structurally matches the study mode described in the user context.
- recapSentinel: the self-check instructs the tutor to close with the literal ===COMPOSED RECAP START=== / WEAK SPOTS: / FOLLOW-UP PROMPT: / ===COMPOSED RECAP END=== block AND tells the student they can paste it back into Composed. (Score 1 if absent.)
Reply with ONLY a JSON object: { "scores": { "<criterion>": n, ... }, "total": <sum>, "notes": "<2-3 sentences>" }.`;

function makeRealDeps(): EvalDeps {
  const graderModel = process.env.SONNET_MODEL ?? 'claude-sonnet-4-6';
  const client = makeClient();
  return {
    generateFn: (inputs, version) => generateFullPromptWithModel(OPUS_MODEL, inputs, '', undefined, version),
    gradeFn: async (prompt, fixture, version) => {
      const userMsg = [
        `Study-prompt version under test: ${version}`,
        `Student context: mode=${fixture.inputs.mode}, confidence=${fixture.inputs.confidence ?? 'unset'}, material=${fixture.inputs.material ? 'provided' : 'none'}, assessment=${fixture.inputs.assessmentType} on ${fixture.inputs.assessmentDate}.`,
        '',
        'PROMPT TO GRADE:',
        prompt,
      ].join('\n');
      const response = await client.messages.create({
        model: graderModel,
        max_tokens: 800,
        system: [{ type: 'text', text: GRADER_SYSTEM, cache_control: { type: 'ephemeral' } }],
        messages: [{ role: 'user', content: userMsg }],
      });
      const block = response.content.find((b) => b.type === 'text');
      const text = block && typeof block.text === 'string' ? block.text : '';
      try {
        const jsonStart = text.indexOf('{');
        const parsed = JSON.parse(text.slice(jsonStart)) as GradeResult;
        const scores = parsed.scores ?? {};
        // Recompute the total from the scores — models miscount; never trust theirs.
        const total = Object.values(scores).reduce((a, b) => a + (typeof b === 'number' ? b : 0), 0);
        return { scores, total, notes: parsed.notes ?? '' };
      } catch {
        // Empty scores marks the row UNGRADEABLE — excluded from means in the summary.
        return { scores: {}, total: 0, notes: `ungradeable response: ${text.slice(0, 120)}` };
      }
    },
  };
}

async function main(): Promise<void> {
  await import('dotenv/config');
  const { mkdirSync, writeFileSync } = await import('node:fs');
  const args = process.argv.slice(2);
  const versionsArg = args[args.indexOf('--versions') + 1];
  if (!args.includes('--versions') || !versionsArg) {
    console.error('Usage: npx tsx scripts/eval-prompts.ts --versions v1,v2 [--yes]');
    process.exit(1);
  }
  const versions = versionsArg.split(',').map((v) => v.trim()) as TemplateVersionId[];
  for (const v of versions) {
    if (!(v in SYSTEM_PROMPTS)) {
      console.error(`Unknown version '${v}'. Registered: ${Object.keys(SYSTEM_PROMPTS).join(', ')}`);
      process.exit(1);
    }
  }

  // Cost guard: rough per-call estimates (opus generation ~$0.12, sonnet grade ~$0.02).
  const calls = EVAL_FIXTURES.length * versions.length;
  const estUsd = calls * 0.12 + calls * 0.02;
  console.log(`This run: ${EVAL_FIXTURES.length} fixtures x ${versions.length} version(s) = ${calls} Opus generations + ${calls} Sonnet grades (~$${estUsd.toFixed(2)} estimated).`);
  if (!args.includes('--yes')) {
    console.error('Refusing to spend money without --yes.');
    process.exit(1);
  }

  const outDir = `eval-output/${new Date().toISOString().replace(/[:.]/g, '-')}`;
  mkdirSync(outDir, { recursive: true });

  const { rows, summaryMarkdown } = await runEval({ versions, fixtures: EVAL_FIXTURES }, makeRealDeps());
  for (const row of rows) {
    if (row.ok && row.prompt) {
      writeFileSync(`${outDir}/${row.fixture}.${row.version}.txt`, row.prompt);
    }
    console.log(`${row.version} ${row.fixture}: ${row.ok ? `total=${row.grade?.total}` : 'GENERATION FAILED'}`);
  }
  writeFileSync(`${outDir}/results.json`, JSON.stringify(rows.map(({ prompt: _p, ...rest }) => rest), null, 2));
  writeFileSync(`${outDir}/summary.md`, summaryMarkdown);
  console.log(`\nWrote ${outDir}/summary.md`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await main();
  process.exit(0);
}
