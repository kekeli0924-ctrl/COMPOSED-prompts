CREATE TABLE IF NOT EXISTS "assessment_outcomes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"generation_id" uuid NOT NULL,
	"outcome" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "assessment_outcomes_generation_id_unique" UNIQUE("generation_id"),
	CONSTRAINT "assessment_outcomes_outcome_check" CHECK ("assessment_outcomes"."outcome" >= 1 AND "assessment_outcomes"."outcome" <= 5)
);
--> statement-breakpoint
ALTER TABLE "generations" ADD COLUMN IF NOT EXISTS "assessment_date" date;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessment_outcomes" ADD CONSTRAINT "assessment_outcomes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "assessment_outcomes" ADD CONSTRAINT "assessment_outcomes_generation_id_generations_id_fk" FOREIGN KEY ("generation_id") REFERENCES "public"."generations"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "generations_user_assessment_idx" ON "generations" USING btree ("user_id","assessment_date");--> statement-breakpoint
-- Backfill from inputs_json (assessmentDate is NOT in the redacted set — only
-- material/understanding/confusion are). Guarded twice: the regex pins the FORMAT,
-- and pg_input_is_valid (PG16+; this project runs PG17) pins CALENDAR validity, so a
-- format-valid impossible date like '2026-02-31' can never abort the apply mid-way.
UPDATE "generations"
SET "assessment_date" = ("inputs_json"->>'assessmentDate')::date
WHERE "assessment_date" IS NULL
  AND "inputs_json"->>'assessmentDate' ~ '^\d{4}-\d{2}-\d{2}$'
  AND pg_input_is_valid("inputs_json"->>'assessmentDate', 'date');
