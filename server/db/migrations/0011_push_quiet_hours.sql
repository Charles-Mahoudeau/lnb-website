ALTER TABLE "push_setting" ADD COLUMN "quiet_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "push_setting" ADD COLUMN "quiet_from" smallint DEFAULT 22 NOT NULL;--> statement-breakpoint
ALTER TABLE "push_setting" ADD COLUMN "quiet_until" smallint DEFAULT 8 NOT NULL;--> statement-breakpoint
ALTER TABLE "push_setting" ADD CONSTRAINT "push_setting_quiet_check" CHECK ("push_setting"."quiet_from" BETWEEN 0 AND 23 AND "push_setting"."quiet_until" BETWEEN 0 AND 23);