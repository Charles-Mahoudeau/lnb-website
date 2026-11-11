CREATE TABLE "economy_listing" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"seller_user_id" text NOT NULL,
	"seller_minecraft_uuid" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"item_snbt" text NOT NULL,
	"item_name" text NOT NULL,
	"count" smallint NOT NULL,
	"price" bigint NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"expires_at" timestamp NOT NULL,
	"ended_at" timestamp,
	"buyer_user_id" text,
	"transaction_id" bigint,
	CONSTRAINT "economy_listing_idempotency_key_unique" UNIQUE("idempotency_key"),
	CONSTRAINT "economy_listing_count" CHECK ("economy_listing"."count" between 1 and 99),
	CONSTRAINT "economy_listing_price" CHECK ("economy_listing"."price" > 0)
);
--> statement-breakpoint
CREATE TABLE "economy_mailbox_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"listing_id" uuid,
	"reason" text NOT NULL,
	"item_id" text NOT NULL,
	"item_snbt" text NOT NULL,
	"item_name" text NOT NULL,
	"count" smallint NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"claimed_at" timestamp,
	"claim_key" uuid,
	"claimed_by_minecraft_uuid" uuid,
	CONSTRAINT "economy_mailbox_item_claim_key_unique" UNIQUE("claim_key")
);
--> statement-breakpoint
ALTER TABLE "economy_settings" ADD COLUMN "auction_tax_percent" smallint DEFAULT 5 NOT NULL;--> statement-breakpoint
ALTER TABLE "economy_settings" ADD COLUMN "auction_max_listings" smallint DEFAULT 20 NOT NULL;--> statement-breakpoint
ALTER TABLE "economy_settings" ADD COLUMN "auction_days" smallint DEFAULT 7 NOT NULL;--> statement-breakpoint
ALTER TABLE "economy_listing" ADD CONSTRAINT "economy_listing_seller_user_id_user_id_fk" FOREIGN KEY ("seller_user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_listing" ADD CONSTRAINT "economy_listing_account_id_economy_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."economy_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_listing" ADD CONSTRAINT "economy_listing_buyer_user_id_user_id_fk" FOREIGN KEY ("buyer_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_listing" ADD CONSTRAINT "economy_listing_transaction_id_economy_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."economy_transaction"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_mailbox_item" ADD CONSTRAINT "economy_mailbox_item_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_mailbox_item" ADD CONSTRAINT "economy_mailbox_item_listing_id_economy_listing_id_fk" FOREIGN KEY ("listing_id") REFERENCES "public"."economy_listing"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "economy_listing_active_idx" ON "economy_listing" USING btree ("status","expires_at");--> statement-breakpoint
CREATE INDEX "economy_listing_seller_idx" ON "economy_listing" USING btree ("seller_user_id","status");--> statement-breakpoint
CREATE INDEX "economy_mailbox_user_idx" ON "economy_mailbox_item" USING btree ("user_id","claimed_at");