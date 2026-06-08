ALTER TABLE "generations" ADD COLUMN "template_version" text;--> statement-breakpoint
UPDATE "generations" SET "template_version" = 'v0-legacy' WHERE "template_version" IS NULL;