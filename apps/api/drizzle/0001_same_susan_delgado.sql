CREATE TABLE IF NOT EXISTS "daily_spend" (
	"day" text PRIMARY KEY NOT NULL,
	"cumulative_usd" numeric(10, 4) DEFAULT '0' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
