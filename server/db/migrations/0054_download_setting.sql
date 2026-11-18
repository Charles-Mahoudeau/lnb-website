CREATE TABLE "download_setting" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"cracked_release_url" text,
	CONSTRAINT "download_setting_single_row" CHECK ("download_setting"."id" = 1)
);
