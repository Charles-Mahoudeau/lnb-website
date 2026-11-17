ALTER TABLE "mod_list_settings" ALTER COLUMN "loader_version" SET DEFAULT 'latest';
--> statement-breakpoint
UPDATE "mod_list_settings" SET "loader_version" = 'latest' WHERE "loader_version" = '';
