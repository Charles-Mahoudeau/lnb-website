CREATE TABLE "quest_category" (
	"family" text NOT NULL,
	"id" text NOT NULL,
	"name" jsonb NOT NULL,
	"icon" text NOT NULL,
	"site_icon" text,
	"subcategories" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"source" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quest_category_family_id_pk" PRIMARY KEY("family","id")
);
--> statement-breakpoint
CREATE TABLE "quest_daily_completion" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"season_id" integer NOT NULL,
	"day" date NOT NULL,
	"quest_id" text NOT NULL,
	"user_id" text,
	"minecraft_uuid" uuid NOT NULL,
	"username" text NOT NULL,
	"quantity" integer NOT NULL,
	"amount" bigint NOT NULL,
	"capped" boolean DEFAULT false NOT NULL,
	"k_global" real NOT NULL,
	"k_player" real NOT NULL,
	"transaction_id" bigint,
	"idempotency_key" uuid NOT NULL,
	"fingerprint" text NOT NULL,
	"completed_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quest_daily_completion_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "quest_daily_draw" (
	"day" date NOT NULL,
	"slot" smallint NOT NULL,
	"quest_id" text NOT NULL,
	"quantity" integer NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "quest_daily_draw_day_slot_pk" PRIMARY KEY("day","slot")
);
--> statement-breakpoint
ALTER TABLE "quest_daily_completion" ADD CONSTRAINT "quest_daily_completion_season_id_quest_season_id_fk" FOREIGN KEY ("season_id") REFERENCES "public"."quest_season"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_daily_completion" ADD CONSTRAINT "quest_daily_completion_quest_id_quest_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quest"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_daily_completion" ADD CONSTRAINT "quest_daily_completion_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_daily_completion" ADD CONSTRAINT "quest_daily_completion_transaction_id_economy_transaction_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."economy_transaction"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quest_daily_draw" ADD CONSTRAINT "quest_daily_draw_quest_id_quest_id_fk" FOREIGN KEY ("quest_id") REFERENCES "public"."quest"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quest_daily_completion_user_idx" ON "quest_daily_completion" USING btree ("day","quest_id","user_id");--> statement-breakpoint
CREATE INDEX "quest_daily_completion_completed_idx" ON "quest_daily_completion" USING btree ("completed_at");--> statement-breakpoint
CREATE UNIQUE INDEX "quest_daily_draw_quest_idx" ON "quest_daily_draw" USING btree ("day","quest_id");--> statement-breakpoint
-- The chapters and Records groups the game used to hard-code. Admins and quests.json can add more.
INSERT INTO "quest_category" ("family", "id", "name", "icon", "site_icon", "sort_order", "source") VALUES
	('individual', 'mining', '{"fr":"Minage","en":"Mining"}', 'minecraft:diamond_pickaxe', 'i-lucide-pickaxe', 0, 'catalog'),
	('individual', 'combat', '{"fr":"Combat","en":"Combat"}', 'minecraft:iron_sword', 'i-lucide-sword', 1, 'catalog'),
	('individual', 'fishing', '{"fr":"Pêche","en":"Fishing"}', 'minecraft:fishing_rod', 'i-lucide-fish', 2, 'catalog'),
	('individual', 'exploration', '{"fr":"Exploration","en":"Exploring"}', 'minecraft:compass', 'i-lucide-compass', 3, 'catalog'),
	('individual', 'crafting', '{"fr":"Artisanat","en":"Crafting"}', 'minecraft:crafting_table', 'i-lucide-hammer', 4, 'catalog'),
	('individual', 'delivery', '{"fr":"Livraisons","en":"Delivery"}', 'minecraft:bundle', 'i-lucide-package', 5, 'catalog'),
	('server', 'overworld', '{"fr":"Monde","en":"Overworld"}', 'minecraft:grass_block', 'i-lucide-trees', 0, 'catalog'),
	('server', 'nether', '{"fr":"Nether","en":"Nether"}', 'minecraft:netherrack', 'i-lucide-flame', 1, 'catalog'),
	('server', 'end', '{"fr":"End","en":"End"}', 'minecraft:end_stone', 'i-lucide-moon-star', 2, 'catalog'),
	('server', 'create', '{"fr":"Create","en":"Create"}', 'create:cogwheel', 'i-lucide-cog', 3, 'catalog'),
	('server', 'stellarity', '{"fr":"Stellarity","en":"Stellarity"}', 'minecraft:end_crystal', 'i-lucide-sparkles', 4, 'catalog'),
	('server', 'cooking', '{"fr":"Cuisine","en":"Cooking"}', 'farmersdelight:cooking_pot', 'i-lucide-chef-hat', 5, 'catalog'),
	('server', 'exploration', '{"fr":"Exploration","en":"Exploration"}', 'minecraft:filled_map', 'i-lucide-compass', 6, 'catalog'),
	('server', 'fishing', '{"fr":"Pêche","en":"Fishing"}', 'minecraft:fishing_rod', 'i-lucide-fish', 7, 'catalog');
--> statement-breakpoint
-- Server quests take the group the game guessed from their advancement: vanilla by dimension, mods by
-- mod, a few mods under one theme.
UPDATE "quest" SET "definition" = jsonb_set("definition", '{category}', to_jsonb(CASE
	WHEN "definition"->>'advancement' LIKE 'minecraft:nether/%' THEN 'nether'
	WHEN "definition"->>'advancement' LIKE 'minecraft:end/%' THEN 'end'
	WHEN "definition"->>'advancement' LIKE 'minecraft:%' THEN 'overworld'
	WHEN split_part("definition"->>'advancement', ':', 1) = 'farmersdelight' THEN 'cooking'
	WHEN split_part("definition"->>'advancement', ':', 1) IN ('betterdeserttemples', 'betterdungeons', 'betterfortresses', 'betterstrongholds', 'betterarcheology', 'lootr') THEN 'exploration'
	WHEN split_part("definition"->>'advancement', ':', 1) = 'tide' THEN 'fishing'
	ELSE substr(regexp_replace(split_part("definition"->>'advancement', ':', 1), '[^a-z0-9_]', '_', 'g'), 1, 32)
END))
WHERE "family" = 'server' AND NOT ("definition" ? 'category');
--> statement-breakpoint
-- Any other mod gets its own group, named after it.
INSERT INTO "quest_category" ("family", "id", "name", "icon", "sort_order", "source")
SELECT DISTINCT 'server', "definition"->>'category', jsonb_build_object('fr', "definition"->>'category', 'en', "definition"->>'category'), 'minecraft:paper', 100, 'catalog'
FROM "quest" WHERE "family" = 'server'
ON CONFLICT DO NOTHING;
