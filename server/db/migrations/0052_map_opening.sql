ALTER TABLE "map_setting" ADD COLUMN "mode" text DEFAULT 'open' NOT NULL;--> statement-breakpoint
ALTER TABLE "map_setting" ADD COLUMN "opens_at" timestamp;--> statement-breakpoint
ALTER TABLE "map_setting" ADD COLUMN "locked_at" timestamp;