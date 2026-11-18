CREATE TABLE "rule" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ref" integer GENERATED ALWAYS AS IDENTITY (sequence name "rule_ref_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"category_id" uuid NOT NULL,
	"title_en" text NOT NULL,
	"title_fr" text DEFAULT '' NOT NULL,
	"text_en" text NOT NULL,
	"text_fr" text DEFAULT '' NOT NULL,
	"position" integer NOT NULL,
	"retired_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "rule_ref_unique" UNIQUE("ref")
);
--> statement-breakpoint
CREATE TABLE "rule_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name_en" text NOT NULL,
	"name_fr" text DEFAULT '' NOT NULL,
	"icon" text NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "warden_ban" ADD COLUMN "rule_citations" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "warden_note" ADD COLUMN "rule_citations" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "rule" ADD CONSTRAINT "rule_category_id_rule_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."rule_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "rule_category_idx" ON "rule" USING btree ("category_id","position");