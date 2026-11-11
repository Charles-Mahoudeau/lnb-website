CREATE TABLE "economy_shop" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"created_by_user_id" text,
	"item_id" text NOT NULL,
	"item_snbt" text NOT NULL,
	"item_name" text NOT NULL,
	"lot_size" smallint NOT NULL,
	"sell_price" bigint NOT NULL,
	"buy_price" bigint,
	"world" text NOT NULL,
	"x" integer NOT NULL,
	"y" integer NOT NULL,
	"z" integer NOT NULL,
	"disabled_at" timestamp,
	"disabled_reason" text,
	"disabled_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "economy_shop_lot_size" CHECK ("economy_shop"."lot_size" between 1 and 99),
	CONSTRAINT "economy_shop_sell_price" CHECK ("economy_shop"."sell_price" > 0),
	CONSTRAINT "economy_shop_buy_price" CHECK ("economy_shop"."buy_price" is null or ("economy_shop"."buy_price" > 0 and "economy_shop"."buy_price" <= "economy_shop"."sell_price"))
);
--> statement-breakpoint
CREATE TABLE "economy_shop_order" (
	"transaction_id" bigint PRIMARY KEY NOT NULL,
	"shop_id" uuid NOT NULL,
	"direction" text NOT NULL,
	"lots" integer NOT NULL,
	"lot_price" bigint NOT NULL
);
--> statement-breakpoint
ALTER TABLE "economy_shop" ADD CONSTRAINT "economy_shop_account_id_economy_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."economy_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_shop" ADD CONSTRAINT "economy_shop_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_shop" ADD CONSTRAINT "economy_shop_disabled_by_user_id_user_id_fk" FOREIGN KEY ("disabled_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_shop_order" ADD CONSTRAINT "economy_shop_order_transaction_id_economy_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."economy_transaction"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "economy_shop_order" ADD CONSTRAINT "economy_shop_order_shop_id_economy_shop_id_fk" FOREIGN KEY ("shop_id") REFERENCES "public"."economy_shop"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "economy_shop_account_idx" ON "economy_shop" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "economy_shop_position_idx" ON "economy_shop" USING btree ("world","x","y","z");--> statement-breakpoint
CREATE INDEX "economy_shop_order_shop_idx" ON "economy_shop_order" USING btree ("shop_id","transaction_id");