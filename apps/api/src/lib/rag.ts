import { db, schema } from './db.js';
import { and, eq, gte, desc } from 'drizzle-orm';

export type RagExample = {
  promptText: string;
  rating: number;
};

export type RagContext = {
  collective: RagExample[];
  personal: RagExample[];
  profile: string | null;
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

export async function queryCollectiveExamples(opts: {
  courseId: string | null;
  mode: string;
  limit: number;
}): Promise<RagExample[]> {
  if (!opts.courseId) return [];
  const rows = await db
    .select({
      promptText: schema.generations.promptText,
      rating: schema.feedback.rating,
    })
    .from(schema.generations)
    .innerJoin(schema.feedback, eq(schema.feedback.generationId, schema.generations.id))
    .where(
      and(
        eq(schema.generations.courseId, opts.courseId),
        eq(schema.generations.mode, opts.mode),
        gte(schema.feedback.rating, 4),
      ),
    )
    .orderBy(desc(schema.feedback.rating), desc(schema.generations.createdAt))
    .limit(opts.limit);
  return rows.map((r) => ({ promptText: extractKeySections(r.promptText), rating: r.rating }));
}

export async function queryPersonalExamples(opts: {
  userId: string;
  courseId: string | null;
  mode: string;
  limit: number;
}): Promise<RagExample[]> {
  if (!opts.courseId) return [];
  const rows = await db
    .select({
      promptText: schema.generations.promptText,
      rating: schema.feedback.rating,
    })
    .from(schema.generations)
    .innerJoin(schema.feedback, eq(schema.feedback.generationId, schema.generations.id))
    .where(
      and(
        eq(schema.generations.userId, opts.userId),
        eq(schema.generations.courseId, opts.courseId),
        eq(schema.generations.mode, opts.mode),
        gte(schema.feedback.rating, 4),
      ),
    )
    .orderBy(desc(schema.feedback.rating), desc(schema.generations.createdAt))
    .limit(opts.limit);
  return rows.map((r) => ({ promptText: extractKeySections(r.promptText), rating: r.rating }));
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
    blocks.push(`What worked for OTHER students in this exact course + mode:\n${examples}`);
  }
  if (blocks.length === 0) return '';
  return [
    '---',
    'Context from past generations that scored well:',
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
  return { collective, personal, profile };
}
