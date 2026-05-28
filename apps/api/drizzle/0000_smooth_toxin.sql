CREATE TABLE IF NOT EXISTS "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL,
	"user_id" uuid,
	"rating" integer NOT NULL,
	"text" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_generation_id_unique" UNIQUE("generation_id"),
	CONSTRAINT "feedback_rating_check" CHECK ("feedback"."rating" >= 1 AND "feedback"."rating" <= 5)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid,
	"ip_hash" text,
	"inputs_json" jsonb NOT NULL,
	"prompt_text" text NOT NULL,
	"prompt_hash" text NOT NULL,
	"generator" text NOT NULL,
	"course_id" text,
	"mode" text NOT NULL,
	"provider" text NOT NULL,
	"model" text NOT NULL,
	"fallback_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "rate_limit_log" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"bucket_key" text NOT NULL,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "sessions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "user_profiles" (
	"user_id" uuid PRIMARY KEY NOT NULL,
	"summary" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"display_name" text,
	"password_hash" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feedback" ADD CONSTRAINT "feedback_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "feedback" ADD CONSTRAINT "feedback_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generations" ADD CONSTRAINT "generations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generations_course_mode_recency_idx" ON "generations" USING btree ("course_id","mode","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generations_user_recency_idx" ON "generations" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "rate_limit_bucket_time_idx" ON "rate_limit_log" USING btree ("bucket_key","occurred_at");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "sessions_user_idx" ON "sessions" USING btree ("user_id");