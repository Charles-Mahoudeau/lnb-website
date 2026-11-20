ALTER TABLE "economy_settings" ALTER COLUMN "casino_license_price" SET DEFAULT 105000;--> statement-breakpoint

-- Retune of the Market and of the casino license from the economy simulation (docs/market.md,
-- "Tuning"). Each statement only touches rows that still hold the seeded draft values of 0059, so an
-- admin's edit is kept. Items get a version row and their stock restarts at the new s0 (ratio 1).
WITH "tuned"("id", "old_p0", "old_p_min", "old_p_max", "old_s0", "old_s_min", "old_s_max", "p0", "p_min", "p_max", "s0", "s_min", "s_max") AS (VALUES
  ('minecraft:cobblestone', 0.05, 0.0025, 0.15, 120000, 12000, 1200000, 0.012, 0.0006, 0.036, 30000, 3000, 300000),
  ('minecraft:sand', 0.08, 0.004, 0.24, 75000, 7500, 750000, 0.02, 0.001, 0.06, 19000, 1900, 190000),
  ('minecraft:oak_log', 0.3, 0.015, 0.9, 20000, 2000, 200000, 0.075, 0.00375, 0.225, 5000, 500, 50000),
  ('minecraft:wheat', 0.25, 0.0125, 0.75, 24000, 2400, 240000, 0.06, 0.003, 0.18, 6000, 600, 60000),
  ('minecraft:sugar_cane', 0.2, 0.01, 0.6, 30000, 3000, 300000, 0.05, 0.0025, 0.15, 7500, 750, 75000),
  ('minecraft:melon_slice', 0.06, 0.003, 0.18, 100000, 10000, 1000000, 0.015, 0.00075, 0.045, 25000, 2500, 250000),
  ('minecraft:kelp', 0.1, 0.005, 0.3, 60000, 6000, 600000, 0.025, 0.00125, 0.075, 15000, 1500, 150000),
  ('minecraft:gunpowder', 0.8, 0.04, 2.4, 7500, 750, 75000, 0.2, 0.01, 0.6, 1900, 190, 19000),
  ('minecraft:bone', 0.35, 0.0175, 1.05, 17000, 1700, 170000, 0.09, 0.0045, 0.27, 4250, 425, 42500),
  ('minecraft:rotten_flesh', 0.15, 0.0075, 0.45, 40000, 4000, 400000, 0.04, 0.002, 0.12, 10000, 1000, 100000),
  ('minecraft:string', 0.5, 0.025, 1.5, 12000, 1200, 120000, 0.12, 0.006, 0.36, 3000, 300, 30000),
  ('minecraft:iron_ingot', 4, 0.2, 12, 1500, 150, 15000, 1, 0.05, 3, 375, 37.5, 3750),
  ('minecraft:glass', 0.5, 0.075, 1.5, 6000, 600, 60000, 0.125, 0.01875, 0.375, 1500, 150, 15000),
  ('minecraft:terracotta', 1.5, 0.225, 4.5, 2000, 200, 20000, 0.38, 0.057, 1.14, 500, 50, 5000),
  ('minecraft:bricks', 2, 0.3, 6, 1500, 150, 15000, 0.5, 0.075, 1.5, 375, 37.5, 3750),
  ('minecraft:cooked_beef', 1.2, 0.18, 3.6, 2500, 250, 25000, 0.3, 0.045, 0.9, 625, 62.5, 6250),
  ('minecraft:golden_carrot', 3, 0.45, 9, 1000, 100, 10000, 0.75, 0.1125, 2.25, 250, 25, 2500),
  ('minecraft:coal', 1.5, 0.225, 4.5, 2000, 200, 20000, 0.38, 0.057, 1.14, 500, 50, 5000),
  ('minecraft:copper_ingot', 1.2, 0.18, 3.6, 2500, 250, 25000, 0.3, 0.045, 0.9, 625, 62.5, 6250),
  ('minecraft:redstone', 1, 0.15, 3, 3000, 300, 30000, 0.25, 0.0375, 0.75, 750, 75, 7500),
  ('minecraft:glowstone_dust', 1.2, 0.18, 3.6, 2500, 250, 25000, 0.3, 0.045, 0.9, 625, 62.5, 6250),
  ('minecraft:ender_pearl', 25, 3.75, 75, 120, 12, 1200, 6, 0.9, 18, 30, 3, 300),
  ('minecraft:gold_ingot', 12, 4.8, 24, 125, 12.5, 1250, 3, 1.2, 6, 30, 3, 300),
  ('minecraft:lapis_lazuli', 1.5, 0.6, 3, 1000, 100, 10000, 0.38, 0.152, 0.76, 250, 25, 2500),
  ('minecraft:diamond', 120, 48, 240, 12, 1.2, 120, 30, 12, 60, 6, 0.6, 60),
  ('minecraft:emerald', 60, 24, 120, 25, 2.5, 250, 15, 6, 30, 6, 0.6, 60),
  ('minecraft:quartz', 2.5, 1, 5, 600, 60, 6000, 0.63, 0.252, 1.26, 150, 15, 1500),
  ('minecraft:slime_ball', 8, 3.2, 16, 190, 19, 1900, 2, 0.8, 4, 48, 4.8, 480),
  ('minecraft:blaze_rod', 30, 12, 60, 50, 5, 500, 7.5, 3, 15, 12, 1.2, 120),
  ('minecraft:ancient_debris', 400, 160, 800, 4, 0.4, 40, 100, 40, 200, 6, 0.6, 60)
), "updated" AS (
  UPDATE "market_item" AS m SET
    "p0" = t."p0", "p_min" = t."p_min", "p_max" = t."p_max",
    "s0" = t."s0", "s_min" = t."s_min", "s_max" = t."s_max",
    "stock" = t."s0", "stock_at" = now(), "updated_at" = now()
  FROM "tuned" t
  WHERE m."id" = t."id" AND m."p0" = t."old_p0" AND m."p_min" = t."old_p_min" AND m."p_max" = t."old_p_max"
    AND m."s0" = t."old_s0" AND m."s_min" = t."old_s_min" AND m."s_max" = t."old_s_max"
  RETURNING m.*
)
INSERT INTO "market_item_version" ("item_id", "parameters")
SELECT "id", jsonb_build_object('tier', "tier", 'enabled', "enabled", 'sellable', "sellable", 'buyable', "buyable",
  'p0', "p0", 'pMin', "p_min", 'pMax', "p_max", 's0', "s0", 'sMin', "s_min", 'sMax', "s_max", 'k', "k", 'alpha', "alpha")
FROM "updated";
--> statement-breakpoint
UPDATE "market_tier_settings" SET "q1" = 3500, "q2" = 9300, "mid_percent" = 40, "tail_percent" = 5
  WHERE "tier" IN (1, 3) AND "q1" = 500000 AND "q2" = 1500000 AND "mid_percent" = 50 AND "tail_percent" = 10;
--> statement-breakpoint
UPDATE "market_tier_settings" SET "q1" = 2900, "q2" = 7000, "mid_percent" = 40, "tail_percent" = 5
  WHERE "tier" = 2 AND "q1" = 500000 AND "q2" = 1500000 AND "mid_percent" = 50 AND "tail_percent" = 10;
--> statement-breakpoint
UPDATE "market_settings" SET "mint_cap_percent" = 15 WHERE "id" = 1 AND "mint_cap_percent" = 25;
--> statement-breakpoint
-- The mod reads the settings again when the revision moves.
UPDATE "market_settings" SET "revision" = "revision" + 1, "updated_at" = now() WHERE "id" = 1;
--> statement-breakpoint
-- 1,050 LNBits, 1 % of the circulation at the time (about 105,000 LNBits).
UPDATE "economy_settings" SET "casino_license_price" = 105000 WHERE "casino_license_price" = 10000000;
