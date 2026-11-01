ALTER TABLE "mod_list_settings" ADD COLUMN "voting_ends_at" timestamp;--> statement-breakpoint
ALTER TABLE "mod_list_settings" ADD COLUMN "show_countdown" boolean DEFAULT true NOT NULL;