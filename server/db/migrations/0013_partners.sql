CREATE TABLE "partner" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"description_en" text NOT NULL,
	"description_fr" text DEFAULT '' NOT NULL,
	"url" text,
	"logo_key" text NOT NULL,
	"position" integer NOT NULL,
	"visible" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_setting" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"contact_url" text,
	CONSTRAINT "partner_setting_single_row" CHECK ("partner_setting"."id" = 1)
);
--> statement-breakpoint
CREATE INDEX "partner_kind_idx" ON "partner" USING btree ("kind","position");