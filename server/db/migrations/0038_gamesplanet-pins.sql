CREATE TABLE "gamesplanet_pin" (
	"uid" text PRIMARY KEY NOT NULL,
	"position" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "gamesplanet_setting" ADD COLUMN "catalog_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "gamesplanet_setting" ADD COLUMN "deals_synced_at" timestamp;--> statement-breakpoint
ALTER TABLE "gamesplanet_pin" ADD CONSTRAINT "gamesplanet_pin_uid_gamesplanet_game_uid_fk" FOREIGN KEY ("uid") REFERENCES "public"."gamesplanet_game"("uid") ON DELETE cascade ON UPDATE no action;