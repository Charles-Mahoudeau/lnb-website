CREATE TABLE "warden_account_transfer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"minecraft_uuid" uuid NOT NULL,
	"username" text NOT NULL,
	"from_user_id" text NOT NULL,
	"to_user_id" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"dismissed_at" timestamp,
	"dismissed_by_user_id" text
);
--> statement-breakpoint
ALTER TABLE "minecraft_account" ADD COLUMN "unlinked_at" timestamp;--> statement-breakpoint
ALTER TABLE "warden_player" ADD COLUMN "transferred_playtime_seconds" bigint DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "warden_account_transfer" ADD CONSTRAINT "warden_account_transfer_from_user_id_user_id_fk" FOREIGN KEY ("from_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_account_transfer" ADD CONSTRAINT "warden_account_transfer_to_user_id_user_id_fk" FOREIGN KEY ("to_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "warden_account_transfer" ADD CONSTRAINT "warden_account_transfer_dismissed_by_user_id_user_id_fk" FOREIGN KEY ("dismissed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "warden_account_transfer_from_idx" ON "warden_account_transfer" USING btree ("from_user_id");--> statement-breakpoint
CREATE INDEX "warden_account_transfer_to_idx" ON "warden_account_transfer" USING btree ("to_user_id");