CREATE TABLE "gamesplanet_click" (
	"day" date NOT NULL,
	"placement" text NOT NULL,
	"uid" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "gamesplanet_click_day_placement_uid_pk" PRIMARY KEY("day","placement","uid")
);
