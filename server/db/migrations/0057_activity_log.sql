CREATE TABLE "audit" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL,
	"action" text NOT NULL,
	"source" text DEFAULT 'site' NOT NULL,
	"actor_user_id" text,
	"actor_minecraft_uuid" uuid,
	"actor_minecraft_name" text,
	"target_user_id" text,
	"target_minecraft_uuid" uuid,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit" ADD CONSTRAINT "audit_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit" ADD CONSTRAINT "audit_target_user_id_user_id_fk" FOREIGN KEY ("target_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_target_user_id_idx" ON "audit" USING btree ("target_user_id","id");--> statement-breakpoint
CREATE INDEX "audit_action_idx" ON "audit" USING btree ("action","id");--> statement-breakpoint
CREATE INDEX "audit_at_idx" ON "audit" USING btree ("at");--> statement-breakpoint
-- One log for the two old ones (docs/activity-log.md). The rows are copied oldest first with fresh
-- IDs, and every action is renamed. Warden actions get `minecraft.` in front (its source `web`
-- becomes `site` and `minecraft` becomes `server`). Admin actions follow the table of the doc, and
-- their source is `system` when nobody did them (a job), `site` otherwise.
INSERT INTO "audit" ("id", "at", "action", "source", "actor_user_id", "actor_minecraft_uuid", "actor_minecraft_name", "target_user_id", "target_minecraft_uuid", "data")
SELECT
	row_number() OVER (ORDER BY "at", "origin", "old_id"),
	"at", "action", "source", "actor_user_id", "actor_minecraft_uuid", "actor_minecraft_name", "target_user_id", "target_minecraft_uuid", "data"
FROM (
	SELECT
		'w' AS "origin", "id" AS "old_id", "at",
		CASE WHEN "action" = 'warden.resetSanctions' THEN 'minecraft.resetSanctions' ELSE 'minecraft.' || "action" END AS "action",
		CASE "source" WHEN 'web' THEN 'site' WHEN 'minecraft' THEN 'server' ELSE "source" END AS "source",
		"actor_user_id", "actor_minecraft_uuid", "actor_minecraft_name", "target_user_id", "target_minecraft_uuid", "data"
	FROM "warden_audit"
	UNION ALL
	SELECT
		'a', "id", "at",
		CASE
			WHEN "action" = 'user.ghostCreate' THEN 'people.ghost.create'
			WHEN "action" = 'user.ghostUpdate' THEN 'people.ghost.update'
			WHEN "action" = 'user.ghostClaim' THEN 'people.ghost.claim'
			WHEN "action" LIKE 'user.%' THEN 'people.' || substr("action", 6)
			WHEN "action" = 'users.deleteInactive' THEN 'people.deleteInactive'
			WHEN "action" LIKE 'event.%' THEN 'events.' || "action"
			WHEN "action" LIKE 'eventTeam.%' THEN 'events.team.' || substr("action", 11)
			WHEN "action" LIKE 'eventRoom.%' THEN 'events.room.' || substr("action", 11)
			WHEN "action" LIKE 'eventType.%' THEN 'events.type.' || substr("action", 11)
			WHEN "action" LIKE 'poster.%' THEN 'events.poster.' || substr("action", 8)
			WHEN "action" = 'push.settings' THEN 'events.push.settings'
			WHEN "action" LIKE 'partnerEvent.%' THEN 'events.partnerEvent.' || substr("action", 14)
			WHEN "action" LIKE 'shortLink.%' THEN 'links.' || substr("action", 11)
			WHEN "action" LIKE 'teamPole.%' THEN 'site.teamPole.' || substr("action", 10)
			WHEN "action" LIKE 'teamMember.%' THEN 'site.teamMember.' || substr("action", 12)
			WHEN "action" = 'team.settings' THEN 'site.team.settings'
			WHEN "action" LIKE 'partner.%' THEN 'site.partner.' || substr("action", 9)
			WHEN "action" = 'partners.settings' THEN 'site.partners.settings'
			WHEN "action" LIKE 'gamesplanet.%' THEN 'site.gamesplanet.' || substr("action", 13)
			WHEN "action" = 'flag.update' THEN 'settings.flag'
			WHEN "action" = 'rateLimit.mode' THEN 'settings.rateLimit'
			WHEN "action" = 'map.settings' THEN 'settings.map'
			WHEN "action" LIKE 'apiKey.%' THEN 'settings.apiKey.' || substr("action", 8)
			WHEN "action" = 'downloads.update' THEN 'minecraft.downloads.update'
			WHEN "action" LIKE 'rule.%' THEN 'minecraft.rule.' || substr("action", 6)
			WHEN "action" LIKE 'quests.%' THEN 'economy.quests.' || substr("action", 8)
			ELSE "action"
		END,
		CASE WHEN "actor_user_id" IS NULL THEN 'system' ELSE 'site' END,
		"actor_user_id", NULL::uuid, NULL::text, "target_user_id", NULL::uuid, "data"
	FROM "admin_audit"
) AS "old";
--> statement-breakpoint
SELECT setval(pg_get_serial_sequence('audit', 'id'), COALESCE(max("id"), 1), max("id") IS NOT NULL) FROM "audit";
--> statement-breakpoint
DROP TABLE "admin_audit";
--> statement-breakpoint
DROP TABLE "warden_audit";
