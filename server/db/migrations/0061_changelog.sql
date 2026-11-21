CREATE TABLE "changelog_post" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"source_lang" text NOT NULL,
	"title_en" text,
	"title_fr" text,
	"summary_en" text,
	"summary_fr" text,
	"body_en" text,
	"body_fr" text,
	"translation_unreviewed" boolean DEFAULT false NOT NULL,
	"version_tag" text,
	"cover_key" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "changelog_post_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "changelog_seen" (
	"post_id" uuid NOT NULL,
	"minecraft_uuid" uuid NOT NULL,
	"seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "changelog_seen_post_id_minecraft_uuid_pk" PRIMARY KEY("post_id","minecraft_uuid")
);
--> statement-breakpoint
ALTER TABLE "changelog_post" ADD CONSTRAINT "changelog_post_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "changelog_seen" ADD CONSTRAINT "changelog_seen_post_id_changelog_post_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."changelog_post"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "changelog_post_status_published_idx" ON "changelog_post" USING btree ("status","published_at");