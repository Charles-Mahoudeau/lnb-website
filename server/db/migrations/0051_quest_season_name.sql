ALTER TABLE "quest_season" ADD COLUMN "name" text;--> statement-breakpoint
ALTER TABLE "quest_season" ADD COLUMN "revision" integer DEFAULT 0 NOT NULL;