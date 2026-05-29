import Anthropic from '@anthropic-ai/sdk';
import { db, schema } from '../lib/db.js';
import { eq, sql, desc, gte } from 'drizzle-orm';

export const MIN_RATED_GENERATIONS = 5;
const LOOKBACK_DAYS = 30;

export type SummarizeFn = (inputs: {
  ratedSamples: Array<{ rating: number; text: string | null; prompt: string }>;
}) => Promise<string>;

const defaultSummarize: SummarizeFn = async ({ ratedSamples }) => {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const samples = ratedSamples
    .map(
      (s) =>
        `Rating: ${s.rating}/5\nComment: ${s.text ?? '(none)'}\nPrompt excerpt: ${s.prompt.slice(0, 800)}`,
    )
    .join('\n\n---\n\n');
  const response = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 400,
    system:
      "You analyze a student's ratings + comments on study prompts to produce a single-paragraph (3-5 sentences) summary of their preferences. Be concrete and specific. Focus on actionable patterns (preferred style, length, depth, types of activities). Output only the summary paragraph, no preamble.",
    messages: [{ role: 'user', content: samples }],
  });
  const block = response.content.find((b) => b.type === 'text');
  if (!block || block.type !== 'text') throw new Error('no text block');
  return block.text.trim();
};

export async function updateAllProfiles(opts: { summarizeFn?: SummarizeFn } = {}): Promise<void> {
  const summarizeFn = opts.summarizeFn ?? defaultSummarize;
  const cutoff = new Date(Date.now() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);

  // Find users with enough rated generations in the lookback window
  const eligibleUsers = await db
    .select({
      userId: schema.generations.userId,
      ratedCount: sql<number>`count(${schema.feedback.id})::int`,
    })
    .from(schema.generations)
    .innerJoin(schema.feedback, eq(schema.feedback.generationId, schema.generations.id))
    .where(gte(schema.generations.createdAt, cutoff))
    .groupBy(schema.generations.userId)
    .having(sql`count(${schema.feedback.id}) >= ${MIN_RATED_GENERATIONS}`);

  for (const eligible of eligibleUsers) {
    if (!eligible.userId) continue;
    const samples = await db
      .select({
        rating: schema.feedback.rating,
        text: schema.feedback.text,
        prompt: schema.generations.promptText,
      })
      .from(schema.generations)
      .innerJoin(schema.feedback, eq(schema.feedback.generationId, schema.generations.id))
      .where(eq(schema.generations.userId, eligible.userId))
      .orderBy(desc(schema.generations.createdAt))
      .limit(30);

    try {
      const summary = await summarizeFn({ ratedSamples: samples });
      await db
        .insert(schema.userProfiles)
        .values({ userId: eligible.userId, summary })
        .onConflictDoUpdate({
          target: schema.userProfiles.userId,
          set: { summary, updatedAt: sql`now()` },
        });
      console.log(`[update-profiles] updated profile for user ${eligible.userId}`);
    } catch (err) {
      console.error(`[update-profiles] failed for user ${eligible.userId}`, {
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

// Entry point when run as a script (tsx loads .ts directly)
if (import.meta.url === `file://${process.argv[1]}`) {
  await import('dotenv/config');
  await updateAllProfiles();
  process.exit(0);
}
