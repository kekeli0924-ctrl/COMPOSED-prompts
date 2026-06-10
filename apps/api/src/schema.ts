import { pgTable, uuid, text, timestamp, integer, jsonb, bigserial, check, index, numeric, type AnyPgColumn } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  clerkUserId: text('clerk_user_id').notNull().unique(),
  gradYear: integer('grad_year'),
  canvasTokenEnc: text('canvas_token_enc'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const generations = pgTable('generations', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  ipHash: text('ip_hash'),
  inputsJson: jsonb('inputs_json').notNull(),
  promptText: text('prompt_text').notNull(),
  promptHash: text('prompt_hash').notNull(),
  generator: text('generator', { enum: ['opus', 'deterministic'] }).notNull(),
  courseId: text('course_id'),
  mode: text('mode').notNull(),
  provider: text('provider').notNull(),
  model: text('model').notNull(),
  fallbackReason: text('fallback_reason'),
  // Prompt-engineering version that produced this row (instrumentation for A/B
  // analysis). Nullable: existing rows are backfilled to 'v0-legacy' by migration;
  // new rows are stamped by the app (currently always 'v1'). Distinct from
  // `generator`, which records opus-vs-deterministic.
  templateVersion: text('template_version'),
  // Stage 2 instrumentation: the recap injected into this generation, if any. SET NULL
  // when the recap is purged/expires — the pointer dies with the recap (retention).
  // The explicit AnyPgColumn return type breaks the generations ⇄ recaps type-inference
  // cycle (TS7022) created by the mutual FKs; runtime behavior is unchanged.
  usedRecapId: uuid('used_recap_id').references((): AnyPgColumn => recaps.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  courseModeRecencyIdx: index('generations_course_mode_recency_idx').on(t.courseId, t.mode, t.createdAt),
  userRecencyIdx: index('generations_user_recency_idx').on(t.userId, t.createdAt),
}));

export const feedback = pgTable('feedback', {
  id: uuid('id').primaryKey().defaultRandom(),
  generationId: uuid('generation_id').notNull().references(() => generations.id, { onDelete: 'cascade' }).unique(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'set null' }),
  rating: integer('rating').notNull(),
  text: text('text'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  ratingCheck: check('feedback_rating_check', sql`${t.rating} >= 1 AND ${t.rating} <= 5`),
}));

export const userProfiles = pgTable('user_profiles', {
  userId: uuid('user_id').primaryKey().references(() => users.id, { onDelete: 'cascade' }),
  summary: text('summary').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const rateLimitLog = pgTable('rate_limit_log', {
  id: bigserial('id', { mode: 'number' }).primaryKey(),
  bucketKey: text('bucket_key').notNull(),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
}, (t) => ({
  bucketTimeIdx: index('rate_limit_bucket_time_idx').on(t.bucketKey, t.occurredAt),
}));

export const dailySpend = pgTable('daily_spend', {
  day: text('day').primaryKey(),  // ISO date YYYY-MM-DD UTC
  cumulativeUsd: numeric('cumulative_usd', { precision: 10, scale: 4 }).notNull().default('0'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// Session recaps a student pastes back after studying (recap capture loop, stage 1).
// PERSONAL-ONLY: a recap belongs to exactly one student (user_id) and must NEVER enter
// any collective/cross-student pool. `recap_text` is the minor's raw account of what
// they got wrong — stored as-is (stage 2 feeds it into the student's OWN next
// generation), never logged, never returned to anyone but its author. Retention is
// enforced by `expires_at` (default now + 30d) via the purge job; rows also cascade
// away when the user is deleted.
export const recaps = pgTable('recaps', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  generationId: uuid('generation_id').references(() => generations.id, { onDelete: 'cascade' }),
  recapText: text('recap_text').notNull(),
  // Structured fields parsed from the sentinel wire format (recap-format.ts) when the
  // paste matches it; null otherwise. Raw recap_text is ALWAYS stored unchanged — the
  // stage-2 fallback needs it. Same personal-only invariant as recap_text.
  weakSpotsJson: jsonb('weak_spots_json'),
  followUpPrompt: text('follow_up_prompt'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => ({
  userRecencyIdx: index('recaps_user_recency_idx').on(t.userId, t.createdAt),
  expiresIdx: index('recaps_expires_idx').on(t.expiresAt),
}));
