-- Seasons are gone: keep only what happened in the current one (the season with no end), so the
-- unique indexes without season_id hold. Contributions and batches go with their community quest.
DELETE FROM "quest_completion" WHERE "season_id" NOT IN (SELECT "id" FROM "quest_season" WHERE "ended_at" IS NULL);--> statement-breakpoint
DELETE FROM "quest_progress" WHERE "season_id" NOT IN (SELECT "id" FROM "quest_season" WHERE "ended_at" IS NULL);--> statement-breakpoint
DELETE FROM "quest_flash_run" WHERE "season_id" NOT IN (SELECT "id" FROM "quest_season" WHERE "ended_at" IS NULL);--> statement-breakpoint
DELETE FROM "quest_daily_completion" WHERE "season_id" NOT IN (SELECT "id" FROM "quest_season" WHERE "ended_at" IS NULL);--> statement-breakpoint
DELETE FROM "quest_community" WHERE "season_id" NOT IN (SELECT "id" FROM "quest_season" WHERE "ended_at" IS NULL);--> statement-breakpoint
ALTER TABLE "quest_community" DROP CONSTRAINT "quest_community_season_id_quest_season_id_fk";
--> statement-breakpoint
ALTER TABLE "quest_completion" DROP CONSTRAINT "quest_completion_season_id_quest_season_id_fk";
--> statement-breakpoint
ALTER TABLE "quest_daily_completion" DROP CONSTRAINT "quest_daily_completion_season_id_quest_season_id_fk";
--> statement-breakpoint
ALTER TABLE "quest_flash_run" DROP CONSTRAINT "quest_flash_run_season_id_quest_season_id_fk";
--> statement-breakpoint
ALTER TABLE "quest_progress" DROP CONSTRAINT "quest_progress_season_id_quest_season_id_fk";
--> statement-breakpoint
DROP INDEX "quest_completion_user_idx";--> statement-breakpoint
DROP INDEX "quest_completion_rank_idx";--> statement-breakpoint
ALTER TABLE "quest_progress" DROP CONSTRAINT "quest_progress_season_id_quest_id_user_id_pk";--> statement-breakpoint
ALTER TABLE "quest_progress" ADD CONSTRAINT "quest_progress_quest_id_user_id_pk" PRIMARY KEY("quest_id","user_id");--> statement-breakpoint
ALTER TABLE "quest_settings" ADD COLUMN "reset_at" timestamp;--> statement-breakpoint
CREATE UNIQUE INDEX "quest_completion_user_idx" ON "quest_completion" USING btree ("quest_id","tier","user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "quest_completion_rank_idx" ON "quest_completion" USING btree ("quest_id","rank");--> statement-breakpoint
ALTER TABLE "quest_community" DROP COLUMN "season_id";--> statement-breakpoint
ALTER TABLE "quest_completion" DROP COLUMN "season_id";--> statement-breakpoint
ALTER TABLE "quest_daily_completion" DROP COLUMN "season_id";--> statement-breakpoint
ALTER TABLE "quest_flash_run" DROP COLUMN "season_id";--> statement-breakpoint
ALTER TABLE "quest_progress" DROP COLUMN "season_id";--> statement-breakpoint
DROP TABLE "quest_season" CASCADE;
