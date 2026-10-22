-- The Minecraft server runs in offline mode: a UUID is the offline UUID of the username, the
-- same as Java's UUID.nameUUIDFromBytes("OfflinePlayer:" + username), case-sensitively.
-- Accounts linked as premium get that UUID, and their history follows.

-- In-flight link codes carry the old UUIDs. Players get a new one the next time they join.
DELETE FROM "device_code" WHERE "client_id" = 'warden' AND "status" = 'pending';--> statement-breakpoint

DO $$
DECLARE
  acc record;
  h text;
  new_uuid uuid;
  holder text;
  migrated integer := 0;
  skipped integer := 0;
BEGIN
  FOR acc IN
    SELECT * FROM "minecraft_account" WHERE "cracked" = false ORDER BY "linked_at", "uuid"
  LOOP
    -- md5 of the bytes, then the version (3) and variant bits Java sets.
    h := md5(convert_to('OfflinePlayer:' || acc.username, 'UTF8'));
    new_uuid := (
      substr(h, 1, 12) || '3' || substr(h, 14, 3)
      || to_hex((('x' || substr(h, 17, 1))::bit(4)::int & 3) | 8) || substr(h, 18, 15)
    )::uuid;

    SELECT "user_id" INTO holder FROM "minecraft_account" WHERE "uuid" = new_uuid;
    IF FOUND THEN
      -- Nothing is merged or deleted. The account keeps its UUID, and an admin decides.
      RAISE WARNING 'Warden: % (%) was not migrated: % is already linked, to user %',
        acc.username, acc.uuid, new_uuid, holder;
      INSERT INTO "warden_audit" ("action", "source", "target_user_id", "target_minecraft_uuid", "data")
      VALUES (
        'uuid.collision', 'system', acc.user_id, acc.uuid,
        jsonb_build_object('username', acc.username, 'offlineUuid', new_uuid, 'linkedTo', holder)
      );
      skipped := skipped + 1;
      CONTINUE;
    END IF;

    -- The children reference the primary key, so the account is copied under its new UUID first.
    INSERT INTO "minecraft_account"
      ("uuid", "user_id", "username", "cracked", "linked_at", "last_seen_at", "playtime_seconds")
    VALUES
      (new_uuid, acc.user_id, acc.username, true, acc.linked_at, acc.last_seen_at, acc.playtime_seconds);
    UPDATE "minecraft_username" SET "minecraft_uuid" = new_uuid WHERE "minecraft_uuid" = acc.uuid;
    UPDATE "warden_session" SET "minecraft_uuid" = new_uuid WHERE "minecraft_uuid" = acc.uuid;
    UPDATE "warden_ban" SET "minecraft_uuid" = new_uuid WHERE "minecraft_uuid" = acc.uuid;
    UPDATE "warden_ban" SET "issued_by_minecraft_uuid" = new_uuid WHERE "issued_by_minecraft_uuid" = acc.uuid;
    UPDATE "warden_ban" SET "revoked_by_minecraft_uuid" = new_uuid WHERE "revoked_by_minecraft_uuid" = acc.uuid;
    UPDATE "warden_note" SET "author_minecraft_uuid" = new_uuid WHERE "author_minecraft_uuid" = acc.uuid;
    UPDATE "warden_audit" SET "actor_minecraft_uuid" = new_uuid WHERE "actor_minecraft_uuid" = acc.uuid;
    UPDATE "warden_audit" SET "target_minecraft_uuid" = new_uuid WHERE "target_minecraft_uuid" = acc.uuid;
    UPDATE "warden_link_request" SET "minecraft_uuid" = new_uuid WHERE "minecraft_uuid" = acc.uuid;
    DELETE FROM "minecraft_account" WHERE "uuid" = acc.uuid;
    migrated := migrated + 1;
  END LOOP;
  RAISE NOTICE 'Warden: % premium accounts moved to their offline UUID, % left as they were (collisions)', migrated, skipped;
END $$;--> statement-breakpoint

ALTER TABLE "minecraft_account" DROP COLUMN "cracked";--> statement-breakpoint
ALTER TABLE "warden_link_request" DROP COLUMN "cracked";--> statement-breakpoint
ALTER TABLE "warden_settings" DROP COLUMN "allow_cracked";
