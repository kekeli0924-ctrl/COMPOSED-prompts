import { pgTable, uuid, text, timestamp, integer, jsonb, bigserial, check, index } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const users = pgTable('users', {
  id: uuid('id').primaryKey().defaultRandom(),
  email: text('email').notNull().unique(),
  displayName: text('display_name'),
  passwordHash: text('password_hash').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
}, (t) => ({
  userIdx: index('sessions_user_idx').on(t.userId),
}));

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
