-- Codes the Minecraft server made for accounts are over: only device requests remain.
DELETE FROM "device_code" WHERE "client_id" = 'warden' AND "id" NOT IN (SELECT "device_code_id" FROM "warden_device_request");--> statement-breakpoint
ALTER TABLE "warden_link_request" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "warden_link_request" CASCADE;--> statement-breakpoint
ALTER TABLE "warden_player" DROP CONSTRAINT "warden_player_server_token_unique";--> statement-breakpoint
ALTER TABLE "warden_player" DROP COLUMN "server_token";--> statement-breakpoint
ALTER TABLE "warden_player" DROP COLUMN "token_rotated_at";