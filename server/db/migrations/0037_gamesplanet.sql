CREATE TABLE "gamesplanet_game" (
	"uid" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"publisher" text,
	"category" text,
	"price_cents" integer NOT NULL,
	"base_price_cents" integer NOT NULL,
	"steam_id" text,
	"pegi" smallint,
	"url" text NOT NULL,
	"packshot_url" text,
	"teaser_url" text,
	"packshot_key" text,
	"teaser_key" text,
	"available_in_france" boolean DEFAULT true NOT NULL,
	"chart_rank" integer,
	"flash_ends_at" timestamp,
	"seen_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "gamesplanet_setting" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"ref_code" text DEFAULT 'teknantes' NOT NULL,
	"catalog_etag" text,
	"charts_etag" text,
	"flash_etag" text,
	CONSTRAINT "gamesplanet_setting_single_row" CHECK ("gamesplanet_setting"."id" = 1)
);
--> statement-breakpoint
CREATE INDEX "gamesplanet_game_chart_idx" ON "gamesplanet_game" USING btree ("chart_rank");--> statement-breakpoint
CREATE INDEX "gamesplanet_game_steam_idx" ON "gamesplanet_game" USING btree ("steam_id");--> statement-breakpoint
CREATE INDEX "gamesplanet_game_name_idx" ON "gamesplanet_game" USING btree (lower("name"));