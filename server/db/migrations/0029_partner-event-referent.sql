ALTER TABLE "partner_event_game" ADD COLUMN "referent_pseudo" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "partner_event_game" ADD COLUMN "referent_email" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "partner_event_game" ADD COLUMN "referent_birth_date" date;--> statement-breakpoint
ALTER TABLE "partner_event_game" ADD COLUMN "referent_role" text DEFAULT 'Manager' NOT NULL;--> statement-breakpoint
ALTER TABLE "partner_event_team" ADD COLUMN "referent_pseudo" text;--> statement-breakpoint
ALTER TABLE "partner_event_team" ADD COLUMN "referent_email" text;--> statement-breakpoint
ALTER TABLE "partner_event_team" ADD COLUMN "referent_birth_date" date;--> statement-breakpoint
ALTER TABLE "partner_event_team" ADD COLUMN "referent_role" text;