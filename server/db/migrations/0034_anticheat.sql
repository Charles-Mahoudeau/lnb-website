CREATE TABLE "anticheat_action" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" uuid,
	"report_id" uuid,
	"action" text NOT NULL,
	"reason" text NOT NULL,
	"sha512" text,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anticheat_alert" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"user_id" text,
	"sha512" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"dismissed_at" timestamp,
	"dismissed_by_user_id" text,
	CONSTRAINT "anticheat_alert_kind_check" CHECK ("anticheat_alert"."kind" IN ('fileRefused', 'bannedFileSeen', 'playerHeld', 'factsDisputed', 'banAffectsPlayers'))
);
--> statement-breakpoint
CREATE TABLE "anticheat_file" (
	"sha512" text PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"fingerprint" bigint,
	"filename" text NOT NULL,
	"declared" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"project_id" uuid,
	"platform_version" jsonb,
	"lookup_state" text DEFAULT 'pending' NOT NULL,
	"lookup_started_at" timestamp,
	"looked_up_at" timestamp,
	"lookup_retry_at" timestamp,
	"facts" jsonb,
	"facts_disputed" boolean DEFAULT false NOT NULL,
	"decision" text,
	"decided_at" timestamp,
	"decided_by_user_id" text,
	"decision_note" text,
	"reviewed_at" timestamp,
	"reviewed_by_user_id" text,
	"reviewed_band" text,
	"score" smallint,
	"band" text,
	"breakdown" jsonb,
	"rules_version" integer,
	"scored_at" timestamp,
	"rescore_at" timestamp,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "anticheat_file_kind_check" CHECK ("anticheat_file"."kind" IN ('mod', 'resourcepack', 'shader', 'client')),
	CONSTRAINT "anticheat_file_lookup_state_check" CHECK ("anticheat_file"."lookup_state" IN ('pending', 'found', 'notFound', 'timedOut', 'skipped')),
	CONSTRAINT "anticheat_file_decision_check" CHECK ("anticheat_file"."decision" IS NULL OR "anticheat_file"."decision" IN ('approved', 'banned'))
);
--> statement-breakpoint
CREATE TABLE "anticheat_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"sha512" text,
	"project_id" uuid,
	"kind" text NOT NULL,
	"actor_user_id" text,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "anticheat_history_kind_check" CHECK ("anticheat_history"."kind" IN ('score', 'approve', 'ban', 'clear', 'reviewed', 'note', 'link', 'unlink'))
);
--> statement-breakpoint
CREATE TABLE "anticheat_mod_id_ban" (
	"mod_id" text PRIMARY KEY NOT NULL,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by_user_id" text
);
--> statement-breakpoint
CREATE TABLE "anticheat_player" (
	"user_id" text PRIMARY KEY NOT NULL,
	"score" smallint DEFAULT 50 NOT NULL,
	"manual_hold" boolean DEFAULT false NOT NULL,
	"hold_reason" text,
	"hold_at" timestamp,
	"hold_by_user_id" text,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anticheat_player_event" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"session_id" uuid,
	"event_id" uuid,
	"kind" text NOT NULL,
	"delta" smallint NOT NULL,
	"applied" boolean NOT NULL,
	"score_after" smallint NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"actor_user_id" text,
	"at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "anticheat_player_event_event_id_unique" UNIQUE("event_id"),
	CONSTRAINT "anticheat_player_event_kind_check" CHECK ("anticheat_player_event"."kind" IN ('challengeWrong', 'challengeMissed', 'modSetChanged', 'channelMismatch', 'modlistIncomplete', 'playtime', 'adminAdjust', 'bulkPenalty', 'holdSet', 'holdCleared'))
);
--> statement-breakpoint
CREATE TABLE "anticheat_project" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"modrinth_id" text,
	"curseforge_id" text,
	"mod_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"declared_mod_id" text,
	"modrinth" jsonb,
	"curseforge" jsonb,
	"decision" text,
	"decided_at" timestamp,
	"decided_by_user_id" text,
	"decision_note" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "anticheat_project_modrinth_id_unique" UNIQUE("modrinth_id"),
	CONSTRAINT "anticheat_project_curseforge_id_unique" UNIQUE("curseforge_id"),
	CONSTRAINT "anticheat_project_declared_mod_id_unique" UNIQUE("declared_mod_id"),
	CONSTRAINT "anticheat_project_kind_check" CHECK ("anticheat_project"."kind" IN ('mod', 'resourcepack', 'shader')),
	CONSTRAINT "anticheat_project_decision_check" CHECK ("anticheat_project"."decision" IS NULL OR "anticheat_project"."decision" IN ('approved', 'banned')),
	CONSTRAINT "anticheat_project_identity_check" CHECK ("anticheat_project"."modrinth_id" IS NOT NULL OR "anticheat_project"."curseforge_id" IS NOT NULL OR "anticheat_project"."declared_mod_id" IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE "anticheat_report" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"minecraft_uuid" uuid NOT NULL,
	"seq" integer NOT NULL,
	"mode" text NOT NULL,
	"rules_version" integer NOT NULL,
	"verdict" jsonb NOT NULL,
	"player_score" smallint NOT NULL,
	"modlist_checked" boolean DEFAULT false NOT NULL,
	"modlist_missing" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"evaluated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anticheat_report_file" (
	"report_id" uuid NOT NULL,
	"sha512" text NOT NULL,
	"kind" text NOT NULL,
	"filename" text NOT NULL,
	"declared" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"score" smallint,
	"effective_score" smallint,
	"band" text,
	"action" text,
	CONSTRAINT "anticheat_report_file_report_id_sha512_pk" PRIMARY KEY("report_id","sha512")
);
--> statement-breakpoint
CREATE TABLE "anticheat_rules" (
	"version" serial PRIMARY KEY NOT NULL,
	"rules" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"created_by_user_id" text
);
--> statement-breakpoint
CREATE TABLE "anticheat_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"mode" text DEFAULT 'observe' NOT NULL,
	"rules_version" integer NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_user_id" text,
	CONSTRAINT "anticheat_settings_single_row" CHECK ("anticheat_settings"."id" = 1),
	CONSTRAINT "anticheat_settings_mode_check" CHECK ("anticheat_settings"."mode" IN ('off', 'observe', 'enforce'))
);
--> statement-breakpoint
CREATE TABLE "anticheat_usage" (
	"user_id" text NOT NULL,
	"sha512" text NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp DEFAULT now() NOT NULL,
	"session_count" integer DEFAULT 1 NOT NULL,
	"last_session_id" uuid,
	"last_version" text,
	"last_minecraft_uuid" uuid NOT NULL,
	CONSTRAINT "anticheat_usage_user_id_sha512_pk" PRIMARY KEY("user_id","sha512")
);
--> statement-breakpoint
ALTER TABLE "mod" ADD COLUMN "optional" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "mod" ADD COLUMN "file_sha512" text;--> statement-breakpoint
ALTER TABLE "anticheat_action" ADD CONSTRAINT "anticheat_action_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_action" ADD CONSTRAINT "anticheat_action_session_id_warden_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."warden_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_action" ADD CONSTRAINT "anticheat_action_report_id_anticheat_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."anticheat_report"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_alert" ADD CONSTRAINT "anticheat_alert_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_alert" ADD CONSTRAINT "anticheat_alert_sha512_anticheat_file_sha512_fk" FOREIGN KEY ("sha512") REFERENCES "public"."anticheat_file"("sha512") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_alert" ADD CONSTRAINT "anticheat_alert_dismissed_by_user_id_user_id_fk" FOREIGN KEY ("dismissed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_file" ADD CONSTRAINT "anticheat_file_project_id_anticheat_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."anticheat_project"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_file" ADD CONSTRAINT "anticheat_file_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_file" ADD CONSTRAINT "anticheat_file_reviewed_by_user_id_user_id_fk" FOREIGN KEY ("reviewed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_history" ADD CONSTRAINT "anticheat_history_sha512_anticheat_file_sha512_fk" FOREIGN KEY ("sha512") REFERENCES "public"."anticheat_file"("sha512") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_history" ADD CONSTRAINT "anticheat_history_project_id_anticheat_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."anticheat_project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_history" ADD CONSTRAINT "anticheat_history_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_mod_id_ban" ADD CONSTRAINT "anticheat_mod_id_ban_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_player" ADD CONSTRAINT "anticheat_player_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_player" ADD CONSTRAINT "anticheat_player_hold_by_user_id_user_id_fk" FOREIGN KEY ("hold_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_player_event" ADD CONSTRAINT "anticheat_player_event_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_player_event" ADD CONSTRAINT "anticheat_player_event_session_id_warden_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."warden_session"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_player_event" ADD CONSTRAINT "anticheat_player_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_project" ADD CONSTRAINT "anticheat_project_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_report" ADD CONSTRAINT "anticheat_report_session_id_warden_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."warden_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_report" ADD CONSTRAINT "anticheat_report_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_report_file" ADD CONSTRAINT "anticheat_report_file_report_id_anticheat_report_id_fk" FOREIGN KEY ("report_id") REFERENCES "public"."anticheat_report"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_report_file" ADD CONSTRAINT "anticheat_report_file_sha512_anticheat_file_sha512_fk" FOREIGN KEY ("sha512") REFERENCES "public"."anticheat_file"("sha512") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_rules" ADD CONSTRAINT "anticheat_rules_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_settings" ADD CONSTRAINT "anticheat_settings_rules_version_anticheat_rules_version_fk" FOREIGN KEY ("rules_version") REFERENCES "public"."anticheat_rules"("version") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_settings" ADD CONSTRAINT "anticheat_settings_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_usage" ADD CONSTRAINT "anticheat_usage_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anticheat_usage" ADD CONSTRAINT "anticheat_usage_sha512_anticheat_file_sha512_fk" FOREIGN KEY ("sha512") REFERENCES "public"."anticheat_file"("sha512") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "anticheat_action_user_id_id_idx" ON "anticheat_action" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "anticheat_alert_open_uidx" ON "anticheat_alert" USING btree ("kind",coalesce("user_id", ''),coalesce("sha512", '')) WHERE "anticheat_alert"."dismissed_at" IS NULL;--> statement-breakpoint
CREATE INDEX "anticheat_alert_created_at_idx" ON "anticheat_alert" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "anticheat_file_project_id_idx" ON "anticheat_file" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "anticheat_file_lookup_idx" ON "anticheat_file" USING btree ("lookup_state","lookup_started_at");--> statement-breakpoint
CREATE INDEX "anticheat_file_kind_score_idx" ON "anticheat_file" USING btree ("kind","score");--> statement-breakpoint
CREATE INDEX "anticheat_file_rescore_at_idx" ON "anticheat_file" USING btree ("rescore_at");--> statement-breakpoint
CREATE INDEX "anticheat_history_sha512_id_idx" ON "anticheat_history" USING btree ("sha512","id");--> statement-breakpoint
CREATE INDEX "anticheat_history_project_id_id_idx" ON "anticheat_history" USING btree ("project_id","id");--> statement-breakpoint
CREATE INDEX "anticheat_player_event_user_id_id_idx" ON "anticheat_player_event" USING btree ("user_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "anticheat_report_session_id_seq_uidx" ON "anticheat_report" USING btree ("session_id","seq");--> statement-breakpoint
CREATE INDEX "anticheat_report_user_id_created_at_idx" ON "anticheat_report" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "anticheat_report_file_sha512_idx" ON "anticheat_report_file" USING btree ("sha512");--> statement-breakpoint
CREATE INDEX "anticheat_usage_sha512_idx" ON "anticheat_usage" USING btree ("sha512");