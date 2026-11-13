CREATE TABLE "quest" (
	"id" text PRIMARY KEY NOT NULL,
	"family" text NOT NULL,
	"definition" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest_community" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" integer NOT NULL,
	"definition" jsonb NOT NULL,
	"starts_at" timestamp NOT NULL,
	"ends_at" timestamp NOT NULL,
	"status" text DEFAULT 'scheduled' NOT NULL,
	"progress" bigint DEFAULT 0 NOT NULL,
	"template_id" uuid,
	"paid_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest_community_batch" (
	"idempotency_key" uuid PRIMARY KEY NOT NULL,
	"community_id" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest_community_contribution" (
	"community_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"amount" bigint NOT NULL,
	"payout" bigint,
	"transaction_id" bigint,
	CONSTRAINT "quest_community_contribution_community_id_user_id_pk" PRIMARY KEY("community_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "quest_community_template" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"definition" jsonb NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest_completion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" integer NOT NULL,
	"quest_id" text NOT NULL,
	"family" text NOT NULL,
	"tier" smallint NOT NULL,
	"rank" integer,
	"user_id" text,
	"minecraft_uuid" uuid NOT NULL,
	"username" text NOT NULL,
	"amount" bigint NOT NULL,
	"capped" boolean DEFAULT false NOT NULL,
	"k_global" real NOT NULL,
	"k_player" real NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"claimed_at" timestamp,
	"claim_key" uuid,
	"claim_fingerprint" text,
	"transaction_id" bigint,
	CONSTRAINT "quest_completion_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "quest_completion_claim_key_unique" UNIQUE("claim_key")
);
--> statement-breakpoint
CREATE TABLE "quest_flash_run" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" integer NOT NULL,
	"quest_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"started_at" timestamp NOT NULL,
	"ended_at" timestamp NOT NULL,
	"winner_user_id" text,
	"winner_minecraft_uuid" uuid,
	"winner_username" text,
	"amount" bigint DEFAULT 0 NOT NULL,
	"capped" boolean DEFAULT false NOT NULL,
	"transaction_id" bigint,
	"idempotency_key" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	CONSTRAINT "quest_flash_run_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "quest_index_day" (
	"day" date PRIMARY KEY NOT NULL,
	"active_players" integer NOT NULL,
	"median" real NOT NULL,
	"q3" real NOT NULL,
	"mean" real NOT NULL,
	"index" real NOT NULL,
	"k_global" real NOT NULL,
	"fallback" boolean NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "quest_progress" (
	"season_id" integer NOT NULL,
	"quest_id" text NOT NULL,
	"user_id" text NOT NULL,
	"value" bigint NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quest_progress_season_id_quest_id_user_id_pk" PRIMARY KEY("season_id","quest_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "quest_season" (
	"id" serial PRIMARY KEY NOT NULL,
	"number" integer NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	CONSTRAINT "quest_season_number_unique" UNIQUE("number")
);
--> statement-breakpoint
CREATE TABLE "quest_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"values" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_user_id" text,
	CONSTRAINT "quest_settings_single_row" CHECK ("quest_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "quest_community" ADD CONSTRAINT "quest_community_season_id_quest_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."quest_season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_community_batch" ADD CONSTRAINT "quest_community_batch_community_id_quest_community_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."quest_community"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_community_contribution" ADD CONSTRAINT "quest_community_contribution_community_id_quest_community_id_fk" FOREIGN KEY ("community_id") REFERENCES "public"."quest_community"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_community_contribution" ADD CONSTRAINT "quest_community_contribution_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_community_contribution" ADD CONSTRAINT "quest_community_contribution_transaction_id_economy_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."economy_transaction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_completion" ADD CONSTRAINT "quest_completion_season_id_quest_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."quest_season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_completion" ADD CONSTRAINT "quest_completion_quest_id_quest_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quest"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_completion" ADD CONSTRAINT "quest_completion_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_completion" ADD CONSTRAINT "quest_completion_transaction_id_economy_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."economy_transaction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_flash_run" ADD CONSTRAINT "quest_flash_run_season_id_quest_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."quest_season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_flash_run" ADD CONSTRAINT "quest_flash_run_quest_id_quest_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quest"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_flash_run" ADD CONSTRAINT "quest_flash_run_winner_user_id_user_id_fk" FOREIGN KEY ("winner_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_flash_run" ADD CONSTRAINT "quest_flash_run_transaction_id_economy_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."economy_transaction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_progress" ADD CONSTRAINT "quest_progress_season_id_quest_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."quest_season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_progress" ADD CONSTRAINT "quest_progress_quest_id_quest_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quest"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_progress" ADD CONSTRAINT "quest_progress_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_settings" ADD CONSTRAINT "quest_settings_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quest_community_status_idx" ON "quest_community" USING btree ("status","starts_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quest_community_running_idx" ON "quest_community" USING btree ("status") WHERE "quest_community"."status" = 'running';--> statement-breakpoint
CREATE UNIQUE INDEX "quest_completion_user_idx" ON "quest_completion" USING btree ("season_id","quest_id","tier","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quest_completion_rank_idx" ON "quest_completion" USING btree ("season_id","quest_id","rank");--> statement-breakpoint
CREATE INDEX "quest_completion_completed_idx" ON "quest_completion" USING btree ("completed_at");--> statement-breakpoint
CREATE INDEX "quest_flash_run_ended_idx" ON "quest_flash_run" USING btree ("ended_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quest_season_current_idx" ON "quest_season" USING btree ("ended_at") WHERE "quest_season"."ended_at" is null;--> statement-breakpoint
-- Season 1 opens with the feature, so the server has a season from its first call.
INSERT INTO "quest_season" ("number") VALUES (1);
