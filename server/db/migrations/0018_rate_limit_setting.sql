CREATE TABLE "rate_limit_setting" (
	"id" text PRIMARY KEY NOT NULL,
	"mode" text NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_user_id" text
);
--> statement-breakpoint
ALTER TABLE "rate_limit_setting" ADD CONSTRAINT "rate_limit_setting_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;