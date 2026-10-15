CREATE TABLE "minecraft_account" (
	"uuid" uuid PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"username" text NOT NULL,
	"cracked" boolean NOT NULL,
	"linked_at" timestamp DEFAULT now() NOT NULL,
	"last_seen_at" timestamp,
	"playtime_seconds" bigint DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "minecraft_username" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"minecraft_uuid" uuid NOT NULL,
	"username" text NOT NULL,
	"first_seen_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warden_appeal" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"ban_id" uuid NOT NULL,
	"body" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"decided_by_user_id" text,
	"decided_at" timestamp,
	"response" text,
	CONSTRAINT "warden_appeal_ban_id_unique" UNIQUE("ban_id")
);
--> statement-breakpoint
CREATE TABLE "warden_audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"source" text NOT NULL,
	"actor_user_id" text,
	"actor_minecraft_uuid" uuid,
	"actor_minecraft_name" text,
	"target_user_id" text,
	"target_minecraft_uuid" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warden_ban" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"minecraft_uuid" uuid,
	"reason" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp,
	"source" text NOT NULL,
	"issued_by_user_id" text,
	"issued_by_minecraft_uuid" uuid,
	"issued_by_minecraft_name" text,
	"revoked_at" timestamp,
	"revoked_by_user_id" text,
	"revoked_by_minecraft_uuid" uuid,
	"revoked_by_minecraft_name" text,
	"revoke_source" text,
	"revoke_reason" text
);
--> statement-breakpoint
CREATE TABLE "warden_link_request" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"device_code_id" text NOT NULL,
	"minecraft_uuid" uuid NOT NULL,
	"username" text NOT NULL,
	"cracked" boolean NOT NULL,
	"bound_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "warden_link_request_device_code_id_unique" UNIQUE("device_code_id")
);
--> statement-breakpoint
CREATE TABLE "warden_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"body" text NOT NULL,
	"source" text NOT NULL,
	"author_user_id" text,
	"author_minecraft_uuid" uuid,
	"author_minecraft_name" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "warden_player" (
	"user_id" text PRIMARY KEY NOT NULL,
	"server_token" text NOT NULL,
	"token_rotated_at" timestamp DEFAULT now() NOT NULL,
	"show_real_name" boolean DEFAULT false NOT NULL,
	"max_accounts" smallint,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "warden_player_server_token_unique" UNIQUE("server_token")
);
--> statement-breakpoint
CREATE TABLE "warden_session" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"minecraft_uuid" uuid NOT NULL,
	"user_id" text NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"last_heartbeat_at" timestamp DEFAULT now() NOT NULL,
	"ended_at" timestamp,
	"end_reason" text
);
--> statement-breakpoint
CREATE TABLE "warden_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"default_max_accounts" smallint DEFAULT 1 NOT NULL,
	"allow_cracked" boolean DEFAULT true NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_user_id" text,
	CONSTRAINT "warden_settings_single_row" CHECK ("warden_settings"."id" = 1)
);
--> statement-breakpoint
ALTER TABLE "minecraft_account" ADD CONSTRAINT "minecraft_account_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "minecraft_username" ADD CONSTRAINT "minecraft_username_minecraft_uuid_minecraft_account_uuid_fk" FOREIGN KEY ("minecraft_uuid") REFERENCES "public"."minecraft_account"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_appeal" ADD CONSTRAINT "warden_appeal_ban_id_warden_ban_id_fk" FOREIGN KEY ("ban_id") REFERENCES "public"."warden_ban"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_appeal" ADD CONSTRAINT "warden_appeal_decided_by_user_id_user_id_fk" FOREIGN KEY ("decided_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_audit" ADD CONSTRAINT "warden_audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_audit" ADD CONSTRAINT "warden_audit_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_ban" ADD CONSTRAINT "warden_ban_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_ban" ADD CONSTRAINT "warden_ban_issued_by_user_id_user_id_fk" FOREIGN KEY ("issued_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_ban" ADD CONSTRAINT "warden_ban_revoked_by_user_id_user_id_fk" FOREIGN KEY ("revoked_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_link_request" ADD CONSTRAINT "warden_link_request_device_code_id_device_code_id_fk" FOREIGN KEY ("device_code_id") REFERENCES "public"."device_code"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_link_request" ADD CONSTRAINT "warden_link_request_bound_user_id_user_id_fk" FOREIGN KEY ("bound_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_note" ADD CONSTRAINT "warden_note_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_note" ADD CONSTRAINT "warden_note_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_player" ADD CONSTRAINT "warden_player_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_session" ADD CONSTRAINT "warden_session_minecraft_uuid_minecraft_account_uuid_fk" FOREIGN KEY ("minecraft_uuid") REFERENCES "public"."minecraft_account"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_session" ADD CONSTRAINT "warden_session_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_settings" ADD CONSTRAINT "warden_settings_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "minecraft_account_user_id_idx" ON "minecraft_account" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "minecraft_username_uuid_username_uidx" ON "minecraft_username" USING btree ("minecraft_uuid","username");--> statement-breakpoint
CREATE INDEX "warden_appeal_status_idx" ON "warden_appeal" USING btree ("status","created_at");--> statement-breakpoint
CREATE INDEX "warden_audit_target_user_id_idx" ON "warden_audit" USING btree ("target_user_id","id");--> statement-breakpoint
CREATE INDEX "warden_audit_action_idx" ON "warden_audit" USING btree ("action","id");--> statement-breakpoint
CREATE INDEX "warden_ban_user_id_created_at_idx" ON "warden_ban" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "warden_link_request_minecraft_uuid_idx" ON "warden_link_request" USING btree ("minecraft_uuid");--> statement-breakpoint
CREATE INDEX "warden_note_user_id_created_at_idx" ON "warden_note" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "warden_session_user_id_started_at_idx" ON "warden_session" USING btree ("user_id","started_at");--> statement-breakpoint
CREATE INDEX "warden_session_open_idx" ON "warden_session" USING btree ("last_heartbeat_at") WHERE "warden_session"."ended_at" is null;--> statement-breakpoint
-- The single settings row, with the defaults.
INSERT INTO "warden_settings" ("id") VALUES (1);
