CREATE TABLE "map_setting" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"url" text,
	CONSTRAINT "map_setting_single_row" CHECK ("map_setting"."id" = 1)
);
