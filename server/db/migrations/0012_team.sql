CREATE TABLE "team_member" (
	"user_id" text PRIMARY KEY NOT NULL,
	"pole_id" uuid NOT NULL,
	"role_en" text NOT NULL,
	"role_fr" text NOT NULL,
	"bio_en" text DEFAULT '' NOT NULL,
	"bio_fr" text DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"show_self" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_pole" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_en" text NOT NULL,
	"name_fr" text NOT NULL,
	"description_en" text DEFAULT '' NOT NULL,
	"description_fr" text DEFAULT '' NOT NULL,
	"icon" text NOT NULL,
	"featured" boolean DEFAULT false NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "team_setting" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"join_url" text,
	CONSTRAINT "team_setting_single_row" CHECK ("team_setting"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "team_member" ADD CONSTRAINT "team_member_pole_id_team_pole_id_fk" FOREIGN KEY ("pole_id") REFERENCES "public"."team_pole"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "team_member_pole_id_idx" ON "team_member" USING btree ("pole_id","position");--> statement-breakpoint
CREATE UNIQUE INDEX "team_pole_featured_uidx" ON "team_pole" USING btree ("featured") WHERE featured;