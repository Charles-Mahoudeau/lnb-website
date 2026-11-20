CREATE TABLE "market_item" (
	"id" text PRIMARY KEY NOT NULL,
	"tier" smallint NOT NULL,
	"enabled" boolean DEFAULT true NOT NULL,
	"sellable" boolean DEFAULT true NOT NULL,
	"buyable" boolean DEFAULT false NOT NULL,
	"p0" numeric(20, 6) NOT NULL,
	"p_min" numeric(20, 6) NOT NULL,
	"p_max" numeric(20, 6) NOT NULL,
	"s0" numeric(20, 6) NOT NULL,
	"s_min" numeric(20, 6) NOT NULL,
	"s_max" numeric(20, 6) NOT NULL,
	"k" numeric(20, 6) NOT NULL,
	"alpha" numeric(20, 6) NOT NULL,
	"stock" numeric(20, 6) NOT NULL,
	"stock_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "market_item_tier" CHECK ("market_item"."tier" between 1 and 3),
	CONSTRAINT "market_item_prices" CHECK ("market_item"."p_min" > 0 and "market_item"."p_min" <= "market_item"."p0" and "market_item"."p0" <= "market_item"."p_max"),
	CONSTRAINT "market_item_stocks" CHECK ("market_item"."s_min" > 0 and "market_item"."s_min" <= "market_item"."s0" and "market_item"."s0" <= "market_item"."s_max"),
	CONSTRAINT "market_item_shape" CHECK ("market_item"."k" > 0 and "market_item"."alpha" >= 0 and "market_item"."alpha" <= 1)
);
--> statement-breakpoint
CREATE TABLE "market_item_version" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"parameters" jsonb NOT NULL,
	"changed_by_user_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_order" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"idempotency_key" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"user_id" text,
	"minecraft_uuid" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"item_id" text NOT NULL,
	"direction" text NOT NULL,
	"quantity" integer NOT NULL,
	"total" bigint NOT NULL,
	"capped" boolean DEFAULT false NOT NULL,
	"transaction_id" bigint NOT NULL,
	"stock_before" numeric(20, 6) NOT NULL,
	"stock_after" numeric(20, 6) NOT NULL,
	"result" jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "market_order_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "market_recipe" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"type" text NOT NULL,
	"output_id" text NOT NULL,
	"output_count" integer NOT NULL,
	"inputs" jsonb NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_sale" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"tier" smallint NOT NULL,
	"nominal" numeric(20, 6) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_settings" (
	"id" smallint PRIMARY KEY DEFAULT 1 NOT NULL,
	"sigma_percent" numeric(20, 6) DEFAULT 15 NOT NULL,
	"tolerance_percent" numeric(20, 6) DEFAULT 1 NOT NULL,
	"max_order_items" integer DEFAULT 2304 NOT NULL,
	"mint_cap_percent" numeric(20, 6) DEFAULT 25 NOT NULL,
	"history_days" integer DEFAULT 365 NOT NULL,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"updated_by_user_id" text,
	CONSTRAINT "market_settings_single_row" CHECK ("market_settings"."id" = 1)
);
--> statement-breakpoint
CREATE TABLE "market_snapshot" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"item_id" text NOT NULL,
	"price" numeric(20, 6) NOT NULL,
	"stock" numeric(20, 6) NOT NULL,
	"at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "market_tier_settings" (
	"tier" smallint PRIMARY KEY NOT NULL,
	"q1" bigint NOT NULL,
	"q2" bigint NOT NULL,
	"mid_percent" smallint NOT NULL,
	"tail_percent" smallint NOT NULL,
	CONSTRAINT "market_tier_settings_tier" CHECK ("market_tier_settings"."tier" between 1 and 3),
	CONSTRAINT "market_tier_settings_thresholds" CHECK ("market_tier_settings"."q1" > 0 and "market_tier_settings"."q1" < "market_tier_settings"."q2")
);
--> statement-breakpoint
ALTER TABLE "market_item_version" ADD CONSTRAINT "market_item_version_item_id_market_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."market_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_item_version" ADD CONSTRAINT "market_item_version_changed_by_user_id_user_id_fk" FOREIGN KEY ("changed_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_order" ADD CONSTRAINT "market_order_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_order" ADD CONSTRAINT "market_order_account_id_economy_account_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."economy_account"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_order" ADD CONSTRAINT "market_order_item_id_market_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."market_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_order" ADD CONSTRAINT "market_order_transaction_id_economy_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."economy_transaction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_sale" ADD CONSTRAINT "market_sale_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_settings" ADD CONSTRAINT "market_settings_updated_by_user_id_user_id_fk" FOREIGN KEY ("updated_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "market_snapshot" ADD CONSTRAINT "market_snapshot_item_id_market_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."market_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "market_item_version_item_idx" ON "market_item_version" USING btree ("item_id","id");--> statement-breakpoint
CREATE INDEX "market_order_created_idx" ON "market_order" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "market_order_item_idx" ON "market_order" USING btree ("item_id","created_at");--> statement-breakpoint
CREATE INDEX "market_order_user_idx" ON "market_order" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "market_order_direction_idx" ON "market_order" USING btree ("direction","created_at");--> statement-breakpoint
CREATE INDEX "market_recipe_output_idx" ON "market_recipe" USING btree ("output_id");--> statement-breakpoint
CREATE INDEX "market_sale_window_idx" ON "market_sale" USING btree ("user_id","tier","created_at");--> statement-breakpoint
CREATE INDEX "market_sale_created_idx" ON "market_sale" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "market_snapshot_item_idx" ON "market_snapshot" USING btree ("item_id","at");--> statement-breakpoint
CREATE INDEX "market_snapshot_at_idx" ON "market_snapshot" USING btree ("at");--> statement-breakpoint

-- Seed: the draft catalog of docs/market.md, the default settings and the flags (off until an admin opens the Market).
INSERT INTO "market_settings" ("id") VALUES (1) ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "market_tier_settings" ("tier", "q1", "q2", "mid_percent", "tail_percent") VALUES (1, 500000, 1500000, 50, 10), (2, 500000, 1500000, 50, 10), (3, 500000, 1500000, 50, 10) ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "market_item" ("id", "tier", "enabled", "sellable", "buyable", "p0", "p_min", "p_max", "s0", "s_min", "s_max", "k", "alpha", "stock") VALUES
  ('minecraft:cobblestone', 1, true, true, true, 0.05, 0.0025, 0.15, 120000, 12000, 1200000, 1.3, 0.05, 120000),
  ('minecraft:sand', 1, true, true, false, 0.08, 0.004, 0.24, 75000, 7500, 750000, 1.3, 0.05, 75000),
  ('minecraft:oak_log', 1, true, true, true, 0.3, 0.015, 0.9, 20000, 2000, 200000, 1.3, 0.05, 20000),
  ('minecraft:wheat', 1, true, true, false, 0.25, 0.0125, 0.75, 24000, 2400, 240000, 1.3, 0.05, 24000),
  ('minecraft:sugar_cane', 1, true, true, false, 0.2, 0.01, 0.6, 30000, 3000, 300000, 1.3, 0.05, 30000),
  ('minecraft:melon_slice', 1, true, true, false, 0.06, 0.003, 0.18, 100000, 10000, 1000000, 1.3, 0.05, 100000),
  ('minecraft:kelp', 1, true, true, false, 0.1, 0.005, 0.3, 60000, 6000, 600000, 1.3, 0.05, 60000),
  ('minecraft:gunpowder', 1, true, true, false, 0.8, 0.04, 2.4, 7500, 750, 75000, 1.3, 0.05, 7500),
  ('minecraft:bone', 1, true, true, false, 0.35, 0.0175, 1.05, 17000, 1700, 170000, 1.3, 0.05, 17000),
  ('minecraft:rotten_flesh', 1, true, true, false, 0.15, 0.0075, 0.45, 40000, 4000, 400000, 1.3, 0.05, 40000),
  ('minecraft:string', 1, true, true, false, 0.5, 0.025, 1.5, 12000, 1200, 120000, 1.3, 0.05, 12000),
  ('minecraft:iron_ingot', 1, true, true, false, 4, 0.2, 12, 1500, 150, 15000, 1.3, 0.05, 1500),
  ('minecraft:glass', 2, true, true, true, 0.5, 0.075, 1.5, 6000, 600, 60000, 0.9, 0.1, 6000),
  ('minecraft:terracotta', 2, true, true, true, 1.5, 0.225, 4.5, 2000, 200, 20000, 0.9, 0.1, 2000),
  ('minecraft:bricks', 2, true, true, true, 2, 0.3, 6, 1500, 150, 15000, 0.9, 0.1, 1500),
  ('minecraft:cooked_beef', 2, true, true, false, 1.2, 0.18, 3.6, 2500, 250, 25000, 0.9, 0.1, 2500),
  ('minecraft:golden_carrot', 2, true, true, false, 3, 0.45, 9, 1000, 100, 10000, 0.9, 0.1, 1000),
  ('minecraft:coal', 2, true, true, true, 1.5, 0.225, 4.5, 2000, 200, 20000, 0.9, 0.1, 2000),
  ('minecraft:copper_ingot', 2, true, true, true, 1.2, 0.18, 3.6, 2500, 250, 25000, 0.9, 0.1, 2500),
  ('minecraft:redstone', 2, true, true, true, 1, 0.15, 3, 3000, 300, 30000, 0.9, 0.1, 3000),
  ('minecraft:glowstone_dust', 2, true, true, true, 1.2, 0.18, 3.6, 2500, 250, 25000, 0.9, 0.1, 2500),
  ('minecraft:ender_pearl', 2, true, true, false, 25, 3.75, 75, 120, 12, 1200, 0.9, 0.1, 120),
  ('minecraft:gold_ingot', 3, true, true, false, 12, 4.8, 24, 125, 12.5, 1250, 0.5, 0.2, 125),
  ('minecraft:lapis_lazuli', 3, true, true, false, 1.5, 0.6, 3, 1000, 100, 10000, 0.5, 0.2, 1000),
  ('minecraft:diamond', 3, true, true, false, 120, 48, 240, 12, 1.2, 120, 0.5, 0.2, 12),
  ('minecraft:emerald', 3, true, true, false, 60, 24, 120, 25, 2.5, 250, 0.5, 0.2, 25),
  ('minecraft:quartz', 3, true, true, true, 2.5, 1, 5, 600, 60, 6000, 0.5, 0.2, 600),
  ('minecraft:slime_ball', 3, true, true, false, 8, 3.2, 16, 190, 19, 1900, 0.5, 0.2, 190),
  ('minecraft:blaze_rod', 3, true, true, false, 30, 12, 60, 50, 5, 500, 0.5, 0.2, 50),
  ('minecraft:ancient_debris', 3, true, true, false, 400, 160, 800, 4, 0.4, 40, 0.5, 0.2, 4)
ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "feature_flag" ("key", "enabled") VALUES ('economy.market', false), ('economy.market.sell', false), ('economy.market.buy', false) ON CONFLICT DO NOTHING;
