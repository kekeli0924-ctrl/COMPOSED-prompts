ALTER TABLE "generations" ADD COLUMN "used_recap_id" uuid;--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "generations" ADD CONSTRAINT "generations_used_recap_id_recaps_id_fk" FOREIGN KEY ("used_recap_id") REFERENCES "public"."recaps"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
