CREATE TABLE "event_team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"event_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"captain_user_id" text,
	"accepts_requests" boolean DEFAULT true NOT NULL,
	"status" text DEFAULT 'incomplete' NOT NULL,
	"validated_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "event_team_status_check" CHECK ("event_team"."status" IN ('incomplete', 'registered', 'waitlist')),
	CONSTRAINT "event_team_validated_check" CHECK (("event_team"."status" = 'incomplete') = ("event_team"."validated_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "event_team_invite" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	CONSTRAINT "event_team_invite_kind_check" CHECK ("event_team_invite"."kind" IN ('invite', 'request')),
	CONSTRAINT "event_team_invite_status_check" CHECK ("event_team_invite"."status" IN ('pending', 'accepted', 'declined', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "event_team_member" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"team_id" uuid NOT NULL,
	"registration_id" bigint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "team_mode" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "team_min" smallint;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "team_max" smallint;--> statement-breakpoint
ALTER TABLE "event_registration" ADD COLUMN "looking_hidden" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "event_team" ADD CONSTRAINT "event_team_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_team" ADD CONSTRAINT "event_team_captain_user_id_user_id_fk" FOREIGN KEY ("captain_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_team_invite" ADD CONSTRAINT "event_team_invite_team_id_event_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."event_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_team_invite" ADD CONSTRAINT "event_team_invite_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_team_member" ADD CONSTRAINT "event_team_member_team_id_event_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."event_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_team_member" ADD CONSTRAINT "event_team_member_registration_id_event_registration_id_fk" FOREIGN KEY ("registration_id") REFERENCES "public"."event_registration"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "event_team_event_id_name_key_uidx" ON "event_team" USING btree ("event_id","name_key");--> statement-breakpoint
CREATE INDEX "event_team_event_id_status_idx" ON "event_team" USING btree ("event_id","status","validated_at");--> statement-breakpoint
CREATE UNIQUE INDEX "event_team_invite_team_id_user_id_pending_uidx" ON "event_team_invite" USING btree ("team_id","user_id") WHERE "event_team_invite"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "event_team_invite_user_id_idx" ON "event_team_invite" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "event_team_member_team_id_registration_id_uidx" ON "event_team_member" USING btree ("team_id","registration_id");--> statement-breakpoint
CREATE INDEX "event_team_member_registration_id_idx" ON "event_team_member" USING btree ("registration_id");--> statement-breakpoint
ALTER TABLE "event" ADD CONSTRAINT "event_team_size_check" CHECK (("event"."team_mode" AND "event"."team_min" >= 2 AND "event"."team_max" >= "event"."team_min" AND "event"."team_max" <= 32) OR (NOT "event"."team_mode" AND "event"."team_min" IS NULL AND "event"."team_max" IS NULL));