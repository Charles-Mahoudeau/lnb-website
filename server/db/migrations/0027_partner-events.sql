CREATE TABLE "partner_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"website_url" text,
	"discord_url" text,
	"hero_key" text,
	"date_text_en" text DEFAULT '' NOT NULL,
	"date_text_fr" text DEFAULT '' NOT NULL,
	"date_confirmed" boolean DEFAULT false NOT NULL,
	"interest_open" boolean DEFAULT true NOT NULL,
	"teams_open" boolean DEFAULT true NOT NULL,
	"closed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "partner_event_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "partner_event_game" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"partner_event_id" uuid NOT NULL,
	"key" text NOT NULL,
	"status" text DEFAULT 'study' NOT NULL,
	"starters" smallint NOT NULL,
	"substitutes" smallint DEFAULT 2 NOT NULL,
	"position" smallint NOT NULL,
	"art_key" text,
	CONSTRAINT "partner_event_game_key" UNIQUE("partner_event_id","key"),
	CONSTRAINT "partner_event_game_status" CHECK ("partner_event_game"."status" in ('confirmed', 'study')),
	CONSTRAINT "partner_event_game_starters" CHECK ("partner_event_game"."starters" between 1 and 16),
	CONSTRAINT "partner_event_game_substitutes" CHECK ("partner_event_game"."substitutes" between 0 and 8)
);
--> statement-breakpoint
CREATE TABLE "partner_event_interest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"game_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"in_game_name" text DEFAULT '' NOT NULL,
	"rank" text DEFAULT '' NOT NULL,
	"hidden" boolean DEFAULT false NOT NULL,
	"consented_at" timestamp NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "partner_event_interest_user" UNIQUE("game_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "partner_event_game" ADD CONSTRAINT "partner_event_game_partner_event_id_partner_event_id_fk" FOREIGN KEY ("partner_event_id") REFERENCES "public"."partner_event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_event_interest" ADD CONSTRAINT "partner_event_interest_game_id_partner_event_game_id_fk" FOREIGN KEY ("game_id") REFERENCES "public"."partner_event_game"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "partner_event_interest" ADD CONSTRAINT "partner_event_interest_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- The first partner event, so the page works before the admin section exists.
INSERT INTO "partner_event" ("slug", "website_url", "discord_url")
VALUES ('arena-league-university-2027', 'https://arenaleague.tv', 'https://discord.gg/wjv9NN7DGg');
--> statement-breakpoint
INSERT INTO "partner_event_game" ("partner_event_id", "key", "status", "starters", "substitutes", "position")
SELECT "id", "game"."key", "game"."status", "game"."starters", "game"."substitutes", "game"."position"
FROM "partner_event",
  (VALUES
    ('lol', 'confirmed', 5, 2, 0),
    ('valorant', 'confirmed', 5, 2, 1),
    ('rocket-league', 'study', 3, 1, 2),
    ('cs2', 'study', 5, 2, 3)
  ) AS "game" ("key", "status", "starters", "substitutes", "position")
WHERE "partner_event"."slug" = 'arena-league-university-2027';
