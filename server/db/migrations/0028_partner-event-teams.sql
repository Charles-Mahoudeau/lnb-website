CREATE TABLE "partner_event_team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"name" text NOT NULL,
	"name_key" text NOT NULL,
	"abbreviation" text NOT NULL,
	"captain_user_id" text,
	"accepts_requests" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "partner_event_team_invite" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"team_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"kind" text NOT NULL,
	"birth_date" date,
	"status" text DEFAULT 'pending' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"resolved_at" timestamp,
	CONSTRAINT "partner_event_team_invite_kind" CHECK ("partner_event_team_invite"."kind" in ('invite', 'request')),
	CONSTRAINT "partner_event_team_invite_status" CHECK ("partner_event_team_invite"."status" in ('pending', 'accepted', 'declined', 'cancelled'))
);
--> statement-breakpoint
CREATE TABLE "partner_event_team_member" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"team_id" uuid NOT NULL,
	"game_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"role" text DEFAULT 'starter' NOT NULL,
	"birth_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "partner_event_team_member_game_user" UNIQUE("game_id","user_id"),
	CONSTRAINT "partner_event_team_member_role" CHECK ("partner_event_team_member"."role" in ('starter', 'substitute'))
);
--> statement-breakpoint
ALTER TABLE "partner_event_team" ADD CONSTRAINT "partner_event_team_game_id_partner_event_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."partner_event_game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_event_team" ADD CONSTRAINT "partner_event_team_captain_user_id_user_id_fk" FOREIGN KEY ("captain_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_event_team_invite" ADD CONSTRAINT "partner_event_team_invite_team_id_partner_event_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."partner_event_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_event_team_invite" ADD CONSTRAINT "partner_event_team_invite_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_event_team_member" ADD CONSTRAINT "partner_event_team_member_team_id_partner_event_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."partner_event_team"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_event_team_member" ADD CONSTRAINT "partner_event_team_member_game_id_partner_event_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."partner_event_game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_event_team_member" ADD CONSTRAINT "partner_event_team_member_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "partner_event_team_name_uidx" ON "partner_event_team" USING btree ("game_id","name_key");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_event_team_abbreviation_uidx" ON "partner_event_team" USING btree ("game_id","abbreviation");--> statement-breakpoint
CREATE UNIQUE INDEX "partner_event_team_invite_pending_uidx" ON "partner_event_team_invite" USING btree ("team_id","user_id") WHERE "partner_event_team_invite"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "partner_event_team_invite_user_idx" ON "partner_event_team_invite" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "partner_event_team_member_team_idx" ON "partner_event_team_member" USING btree ("team_id");