CREATE TABLE "economy_casino_license" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"price" bigint NOT NULL,
	"paid_by_account_id" uuid NOT NULL,
	"transaction_id" bigint,
	"idempotency_key" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"account_id" uuid,
	"bound_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "economy_casino_license_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "economy_casino_license_account_id_unique" UNIQUE("account_id")
);
--> statement-breakpoint
ALTER TABLE "economy_account" DROP CONSTRAINT "economy_account_kind_fields";--> statement-breakpoint
ALTER TABLE "economy_account" ADD COLUMN "type" text;--> statement-breakpoint
-- Every shared account that already exists is a team.
UPDATE "economy_account" SET "type" = 'team' WHERE "kind" = 'shared';--> statement-breakpoint
ALTER TABLE "economy_listing" ADD COLUMN "seller_notified_at" timestamp;--> statement-breakpoint
ALTER TABLE "economy_settings" ADD COLUMN "casino_license_price" bigint DEFAULT 100000 NOT NULL;--> statement-breakpoint
ALTER TABLE "economy_casino_license" ADD CONSTRAINT "economy_casino_license_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_casino_license" ADD CONSTRAINT "economy_casino_license_paid_by_account_id_economy_account_id_fk" FOREIGN KEY ("paid_by_account_id") REFERENCES "public"."economy_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_casino_license" ADD CONSTRAINT "economy_casino_license_transaction_id_economy_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."economy_transaction"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_casino_license" ADD CONSTRAINT "economy_casino_license_account_id_economy_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."economy_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "economy_casino_license_user_idx" ON "economy_casino_license" USING btree ("user_id");--> statement-breakpoint
ALTER TABLE "economy_account" ADD CONSTRAINT "economy_account_kind_fields" CHECK (("economy_account"."kind" = 'personal' and "economy_account"."handle" is null and "economy_account"."type" is null) or ("economy_account"."kind" = 'shared' and "economy_account"."handle" is not null and "economy_account"."owner_user_id" is null and "economy_account"."type" is not null));