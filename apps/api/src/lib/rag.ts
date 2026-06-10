import { db, schema } from './db.js';
import { and, eq, gte, desc, inArray, type SQL } from 'drizzle-orm';
import { findCourse, allCourses, goldenExamplesForMode, type GoldenExample } from '@composed-prompts/shared';

export type RagExample = {
  promptText: string;
  rating: number;
};

export type RagContext = {
  collective: RagExample[];
  personal: RagExample[];
  profile: string | null;
  // Curated golden exemplars — the floor when every collective tier is empty
  // (small-school cold start). Hand-written, never student content.
  curated: GoldenExample[];
};

const extractKeySections = (promptText: string): string => {
  // Extract just <interaction_style> + <output_spec> from the prompt (XML format)
  // Also handle markdown (## INTERACTION_STYLE / ## OUTPUT_SPEC)
  // and numbered (Step N — INTERACTION_STYLE:) for completeness
  const sections: string[] = [];
  const xmlInter = promptText.match(/<interaction_style>([\s\S]*?)<\/interaction_style>/);
  if (xmlInter) sections.push(xmlInter[0]!);
  const xmlOut = promptText.match(/<output_spec>([\s\S]*?)<\/output_spec>/);
  if (xmlOut) sections.push(xmlOut[0]!);
  if (sections.length) return sections.join('\n\n');

  const mdInter = promptText.match(/## INTERACTION_STYLE[\s\S]*?(?=\n\n## |\nStep \d|$)/);
  if (mdInter) sections.push(mdInter[0]!);
  const mdOut = promptText.match(/## OUTPUT_SPEC[\s\S]*?(?=\n\n## |\nStep \d|$)/);
  if (mdOut) sections.push(mdOut[0]!);
  if (sections.length) return sections.join('\n\n');

  // Fallback: take first 1000 chars
  return promptText.slice(0, 1000);
};

// Shared core: high-rated generations matching `extra` predicates, key sections only.
// Recaps are NEVER queried here — RAG reads generations+feedback exclusively.
async function queryRatedExamples(extra: SQL[], limit: number): Promise<RagExample[]> {
  const rows = await db
    .select({
      promptText: schema.generations.promptText,
      rating: schema.feedback.rating,
    })
    .from(schema.generations)
    .innerJoin(schema.feedback, eq(schema.feedback.generationId, schema.generations.id))
    .where(and(gte(schema.feedback.rating, 4), ...extra))
    .orderBy(desc(schema.feedback.rating), desc(schema.generations.createdAt))
    .limit(limit);
  return rows.map((r) => ({ promptText: extractKeySections(r.promptText), rating: r.rating }));
}

// Collective examples, tiered so small-school data never starves the context.
// Stops at the FIRST tier with results: (1) same course + mode, (2) same department +
// mode (course list derived from the catalog), (3) same mode, any course. Free-text
// courses (no catalog id) skip tiers 1-2 but still get tier 3.
export async function queryCollectiveExamples(opts: {
  courseId: string | null;
  mode: string;
  limit: number;
}): Promise<RagExample[]> {
  const mode = eq(schema.generations.mode, opts.mode);

  if (opts.courseId) {
    const tier1 = await queryRatedExamples([eq(schema.generations.courseId, opts.courseId), mode], opts.limit);
    if (tier1.length > 0) return tier1;

    const course = findCourse(opts.courseId);
    if (course) {
      const deptCourseIds = allCourses()
        .filter((c) => c.department === course.department)
        .map((c) => c.id);
      const tier2 = await queryRatedExamples([inArray(schema.generations.courseId, deptCourseIds), mode], opts.limit);
      if (tier2.length > 0) return tier2;
    }
  }

  return queryRatedExamples([mode], opts.limit);
}

// Personal examples: same user + course + mode, falling back to same user + mode.
export async function queryPersonalExamples(opts: {
  userId: string;
  courseId: string | null;
  mode: string;
  limit: number;
}): Promise<RagExample[]> {
  const user = eq(schema.generations.userId, opts.userId);
  const mode = eq(schema.generations.mode, opts.mode);

  if (opts.courseId) {
    const tier1 = await queryRatedExamples([user, eq(schema.generations.courseId, opts.courseId), mode], opts.limit);
    if (tier1.length > 0) return tier1;
  }
  return queryRatedExamples([user, mode], opts.limit);
}

export async function queryPersonalProfile(userId: string): Promise<string | null> {
  const [row] = await db.select().from(schema.userProfiles).where(eq(schema.userProfiles.userId, userId));
  return row?.summary ?? null;
}

export function buildRagContext(ctx: RagContext): string {
  const blocks: string[] = [];
  if (ctx.profile) {
    blocks.push(`Personal style notes:\n${ctx.profile}`);
  }
  if (ctx.personal.length > 0) {
    const examples = ctx.personal.map((e) => `- ${e.promptText}`).join('\n');
    blocks.push(`What worked for THIS student previously:\n${examples}`);
  }
  if (ctx.collective.length > 0) {
    const examples = ctx.collective.map((e) => `- ${e.promptText}`).join('\n');
    // Phrased to stay truthful for every tier — these rows may come from the exact
    // course, the same department, or just the same study mode (closest match wins).
    blocks.push(`What worked for OTHER students (closest available match — same course, same department, or same study mode):\n${examples}`);
  }
  if (ctx.curated.length > 0) {
    // Marked as curated, NOT as another student's prompt — these are hand-written.
    const examples = ctx.curated
      .map((e) => `- Curated example (interaction style): ${e.interactionStyle}\n- Curated example (output spec): ${e.outputSpec}`)
      .join('\n');
    blocks.push(`Curated examples for this study mode (hand-written exemplars, not from students):\n${examples}`);
  }
  if (blocks.length === 0) return '';
  return [
    '---',
    // Truthful for every combination — including the curated-exemplars-only case.
    'Context to guide this generation (highly-rated past prompts and/or curated exemplars):',
    '',
    ...blocks,
    '',
    "Adapt these — don't copy them. Match the spirit of what worked, not the literal wording.",
  ].join('\n');
}

export async function fetchRagContext(opts: {
  userId: string | null;
  courseId: string | null;
  mode: string;
}): Promise<RagContext> {
  const [collective, personal, profile] = await Promise.all([
    queryCollectiveExamples({ courseId: opts.courseId, mode: opts.mode, limit: 2 }),
    opts.userId
      ? queryPersonalExamples({ userId: opts.userId, courseId: opts.courseId, mode: opts.mode, limit: 1 })
      : Promise.resolve([]),
    opts.userId ? queryPersonalProfile(opts.userId) : Promise.resolve(null),
  ]);
  // Golden-exemplar floor: only when every collective tier came back empty.
  const curated = collective.length === 0 ? goldenExamplesForMode(opts.mode).slice(0, 2) : [];
  return { collective, personal, profile, curated };
}
