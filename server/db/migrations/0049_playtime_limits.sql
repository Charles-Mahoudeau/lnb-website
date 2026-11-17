CREATE TABLE "playtime_closure" (
	"id" serial PRIMARY KEY NOT NULL,
	"label" text NOT NULL,
	"starts_on" date NOT NULL,
	"ends_on" date NOT NULL,
	"tenant_ids" text[],
	"event_id" uuid,
	"event_scope" text,
	"created_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "playtime_closure_dates_check" CHECK ("playtime_closure"."ends_on" >= "playtime_closure"."starts_on"),
	CONSTRAINT "playtime_closure_event_scope_check" CHECK (("playtime_closure"."event_id" IS NULL) = ("playtime_closure"."event_scope" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "playtime_exemption" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text,
	"minecraft_uuid" uuid,
	"reason" text NOT NULL,
	"until" timestamp,
	"set_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "playtime_exemption_target_check" CHECK (("playtime_exemption"."user_id" IS NULL) <> ("playtime_exemption"."minecraft_uuid" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "playtime_grant" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"week_start" date NOT NULL,
	"seconds" integer NOT NULL,
	"reason" text NOT NULL,
	"granted_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"revoked_at" timestamp,
	CONSTRAINT "playtime_grant_seconds_check" CHECK ("playtime_grant"."seconds" BETWEEN 1 AND 18000)
);
--> statement-breakpoint
CREATE TABLE "playtime_ledger" (
	"session_id" uuid NOT NULL,
	"week_start" date NOT NULL,
	"user_id" text NOT NULL,
	"minecraft_uuid" uuid NOT NULL,
	"counted_seconds" integer DEFAULT 0 NOT NULL,
	"grace_seconds" integer DEFAULT 0 NOT NULL,
	"over_seconds" integer DEFAULT 0 NOT NULL,
	"free_seconds" integer DEFAULT 0 NOT NULL,
	"counted_until" timestamp NOT NULL,
	CONSTRAINT "playtime_ledger_session_id_week_start_pk" PRIMARY KEY("session_id","week_start")
);
--> statement-breakpoint
CREATE TABLE "playtime_notice" (
	"session_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "playtime_notice_session_id_kind_pk" PRIMARY KEY("session_id","kind")
);
--> statement-breakpoint
CREATE TABLE "playtime_school" (
	"tenant_id" text PRIMARY KEY NOT NULL,
	"allowance_seconds" integer,
	"schedule" jsonb,
	"grace_seconds" integer,
	"warnings_minutes" jsonb,
	"start_warnings_minutes" jsonb,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_user_id" text
);
--> statement-breakpoint
CREATE TABLE "playtime_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"mode" text DEFAULT 'observe' NOT NULL,
	"allowance_seconds" integer DEFAULT 36000 NOT NULL,
	"schedule" jsonb NOT NULL,
	"grace_seconds" integer DEFAULT 3600 NOT NULL,
	"warnings_minutes" jsonb NOT NULL,
	"start_warnings_minutes" jsonb NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_user_id" text,
	CONSTRAINT "playtime_settings_single_row" CHECK ("playtime_settings"."id" = 1),
	CONSTRAINT "playtime_settings_mode_check" CHECK ("playtime_settings"."mode" IN ('off', 'observe', 'enforce'))
);
--> statement-breakpoint
ALTER TABLE "warden_player" ADD COLUMN "playtime_allowance_seconds" integer;--> statement-breakpoint
ALTER TABLE "warden_player" ADD COLUMN "playtime_grace_seconds" integer;--> statement-breakpoint
ALTER TABLE "warden_player" ADD COLUMN "playtime_warnings_minutes" jsonb;--> statement-breakpoint
ALTER TABLE "playtime_closure" ADD CONSTRAINT "playtime_closure_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtime_closure" ADD CONSTRAINT "playtime_closure_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtime_exemption" ADD CONSTRAINT "playtime_exemption_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtime_exemption" ADD CONSTRAINT "playtime_exemption_minecraft_uuid_minecraft_account_uuid_fk" FOREIGN KEY ("minecraft_uuid") REFERENCES "public"."minecraft_account"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtime_exemption" ADD CONSTRAINT "playtime_exemption_set_by_user_id_user_id_fk" FOREIGN KEY ("set_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtime_grant" ADD CONSTRAINT "playtime_grant_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtime_grant" ADD CONSTRAINT "playtime_grant_granted_by_user_id_user_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtime_ledger" ADD CONSTRAINT "playtime_ledger_session_id_warden_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."warden_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtime_ledger" ADD CONSTRAINT "playtime_ledger_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtime_ledger" ADD CONSTRAINT "playtime_ledger_minecraft_uuid_minecraft_account_uuid_fk" FOREIGN KEY ("minecraft_uuid") REFERENCES "public"."minecraft_account"("uuid") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtime_notice" ADD CONSTRAINT "playtime_notice_session_id_warden_session_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."warden_session"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtime_school" ADD CONSTRAINT "playtime_school_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "playtime_settings" ADD CONSTRAINT "playtime_settings_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "playtime_closure_dates_idx" ON "playtime_closure" USING btree ("starts_on","ends_on");--> statement-breakpoint
CREATE INDEX "playtime_exemption_user_id_idx" ON "playtime_exemption" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "playtime_exemption_minecraft_uuid_idx" ON "playtime_exemption" USING btree ("minecraft_uuid");--> statement-breakpoint
CREATE INDEX "playtime_grant_user_week_idx" ON "playtime_grant" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE INDEX "playtime_ledger_user_week_idx" ON "playtime_ledger" USING btree ("user_id","week_start");--> statement-breakpoint
CREATE INDEX "playtime_ledger_week_idx" ON "playtime_ledger" USING btree ("week_start");
--> statement-breakpoint
-- The single settings row, in `observe` mode: everything is counted and shown, nobody is denied.
INSERT INTO "playtime_settings" ("id", "mode", "allowance_seconds", "schedule", "grace_seconds", "warnings_minutes", "start_warnings_minutes")
VALUES (
	1,
	'observe',
	36000,
	'{"mon":[["09:00","17:00"]],"tue":[["09:00","17:00"]],"wed":[["09:00","17:00"]],"thu":[["09:00","17:00"]],"fri":[["09:00","17:00"]],"sat":[],"sun":[]}'::jsonb,
	3600,
	'[30,10,5,1]'::jsonb,
	'[5,1]'::jsonb
);
