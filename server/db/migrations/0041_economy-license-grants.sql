ALTER TABLE "economy_casino_license" ALTER COLUMN "paid_by_account_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "economy_casino_license" ALTER COLUMN "idempotency_key" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "economy_casino_license" ALTER COLUMN "fingerprint" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "economy_casino_license" ADD COLUMN "granted_by_user_id" text;--> statement-breakpoint
ALTER TABLE "economy_casino_license" ADD CONSTRAINT "economy_casino_license_granted_by_user_id_user_id_fk" FOREIGN KEY ("granted_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;