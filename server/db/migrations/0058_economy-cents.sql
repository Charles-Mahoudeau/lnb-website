-- Money moves from whole LNBits to integer cents of LNBit (1 LNBit = 100 cents). Every amount is
-- multiplied by 100 once, here. Counts (items, lots, quantities) and the quest index, which stays
-- in LNBits, are left alone. Drizzle runs this migration once, in one transaction.
ALTER TABLE "economy_settings" ALTER COLUMN "starting_balance" SET DATA TYPE bigint;--> statement-breakpoint
ALTER TABLE "economy_settings" ALTER COLUMN "casino_license_price" SET DEFAULT 10000000;--> statement-breakpoint
UPDATE "economy_account" SET "balance" = "balance" * 100;--> statement-breakpoint
UPDATE "economy_casino_license" SET "price" = "price" * 100;--> statement-breakpoint
UPDATE "economy_entry" SET "amount" = "amount" * 100, "balance_after" = "balance_after" * 100;--> statement-breakpoint
UPDATE "economy_shop" SET "sell_price" = "sell_price" * 100, "buy_price" = "buy_price" * 100;--> statement-breakpoint
UPDATE "economy_shop_order" SET "lot_price" = "lot_price" * 100;--> statement-breakpoint
UPDATE "economy_listing" SET "price" = "price" * 100;--> statement-breakpoint
UPDATE "economy_settings" SET "starting_balance" = "starting_balance" * 100, "casino_license_price" = "casino_license_price" * 100;--> statement-breakpoint
UPDATE "economy_daily_stat" SET
	"minted" = "minted" * 100,
	"burned" = "burned" * 100,
	"supply" = "supply" * 100,
	"volume" = COALESCE(
		(
			SELECT jsonb_object_agg(
				"kind"."key",
				jsonb_set("kind"."value", '{amount}', to_jsonb(("kind"."value"->>'amount')::bigint * 100))
			)
			FROM jsonb_each("economy_daily_stat"."volume") AS "kind"
		),
		'{}'::jsonb
	);--> statement-breakpoint
UPDATE "quest_completion" SET "amount" = "amount" * 100;--> statement-breakpoint
UPDATE "quest_flash_run" SET "amount" = "amount" * 100;--> statement-breakpoint
UPDATE "quest_daily_completion" SET "amount" = "amount" * 100;--> statement-breakpoint
UPDATE "quest_community_contribution" SET "payout" = "payout" * 100;
