CREATE TABLE "modpack_mod" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source" text NOT NULL,
	"source_id" text,
	"vote_mod_id" bigint,
	"name" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"page_url" text,
	"icon_key" text,
	"side" text DEFAULT 'both' NOT NULL,
	"optional" boolean DEFAULT false NOT NULL,
	"attention" text,
	"pinned_version" text,
	"pinned_file_name" text,
	"pinned_url" text,
	"pinned_sha256" text,
	"pinned_sha512" text,
	"pinned_size" bigint,
	"pinned_file_id" uuid,
	"latest_version" text,
	"latest_file_name" text,
	"latest_url" text,
	"latest_sha256" text,
	"latest_sha512" text,
	"latest_size" bigint,
	"latest_checked_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "modpack_state" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "modpack_state_single_row" CHECK ("modpack_state"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "modpack_mod" ADD CONSTRAINT "modpack_mod_vote_mod_id_mod_id_fk" FOREIGN KEY ("vote_mod_id") REFERENCES "public"."mod"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "modpack_mod" ADD CONSTRAINT "modpack_mod_pinned_file_id_stored_file_id_fk" FOREIGN KEY ("pinned_file_id") REFERENCES "public"."stored_file"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "modpack_mod_source_source_id_uidx" ON "modpack_mod" USING btree ("source","source_id") WHERE "modpack_mod"."source_id" IS NOT NULL;
--> statement-breakpoint
INSERT INTO "modpack_state" ("id", "revision") VALUES (1, 1);
