CREATE TABLE "mod" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"list" text NOT NULL,
	"status" text DEFAULT 'visible' NOT NULL,
	"source" text NOT NULL,
	"source_id" text,
	"name" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"page_url" text NOT NULL,
	"icon_key" text,
	"proposer_user_id" text,
	"reason" text,
	"removed_reason" text,
	"removed_at" timestamp,
	"removed_by_user_id" text,
	"removal_seen_at" timestamp,
	"promoted_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mod_list_check" CHECK ("mod"."list" IN ('official', 'suggestion')),
	CONSTRAINT "mod_status_check" CHECK ("mod"."status" IN ('visible', 'removed'))
);
--> statement-breakpoint
CREATE TABLE "mod_list_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"open" boolean DEFAULT true NOT NULL,
	"max_suggestions" smallint DEFAULT 5 NOT NULL,
	"game_version" text DEFAULT '1.21.1' NOT NULL,
	"loader" text DEFAULT 'neoforge' NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_user_id" text,
	CONSTRAINT "mod_list_settings_single_row" CHECK ("mod_list_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "mod_vote" (
	"mod_id" bigint NOT NULL,
	"user_id" text NOT NULL,
	"value" smallint NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "mod_vote_mod_id_user_id_pk" PRIMARY KEY("mod_id","user_id"),
	CONSTRAINT "mod_vote_value_check" CHECK ("mod_vote"."value" IN (-1, 1))
);
--> statement-breakpoint
ALTER TABLE "mod" ADD CONSTRAINT "mod_proposer_user_id_user_id_fk" FOREIGN KEY ("proposer_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mod" ADD CONSTRAINT "mod_removed_by_user_id_user_id_fk" FOREIGN KEY ("removed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mod_list_settings" ADD CONSTRAINT "mod_list_settings_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mod_vote" ADD CONSTRAINT "mod_vote_mod_id_mod_id_fk" FOREIGN KEY ("mod_id") REFERENCES "public"."mod"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "mod_vote" ADD CONSTRAINT "mod_vote_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "mod_source_source_id_uidx" ON "mod" USING btree ("source","source_id") WHERE "mod"."source_id" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "mod_proposer_user_id_list_idx" ON "mod" USING btree ("proposer_user_id","list");--> statement-breakpoint
CREATE INDEX "mod_vote_user_id_idx" ON "mod_vote" USING btree ("user_id");--> statement-breakpoint
-- The single settings row, with the defaults.
INSERT INTO "mod_list_settings" ("id") VALUES (1);
