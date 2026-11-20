import type pg from 'pg';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { applyMigration, databaseBefore } from './migrations.ts';
import { validateMarketLoops } from '../../shared/utils/market-recipes.ts';
import type { MarketRecipe } from '../../shared/utils/market-recipes.ts';

// 0060 retunes the seeded Market and the casino license price, but only where a row still holds
// the draft of 0059, so an admin's edit survives. See docs/market.md ("Tuning").

const MIGRATION = '0060_market-retune';

// Real recipes between catalog items and the things around them (inputs the Market doesn't sell
// have no cost, so only buyable inputs can start a loop).
const recipes: MarketRecipe[] = [
  ['minecraft:smelting', 'minecraft:glass', 1, [['minecraft:sand', 1]]],
  ['minecraft:smelting', 'minecraft:iron_ingot', 1, [['minecraft:raw_iron', 1]]],
  ['minecraft:smelting', 'minecraft:copper_ingot', 1, [['minecraft:raw_copper', 1]]],
  ['minecraft:smelting', 'minecraft:terracotta', 1, [['minecraft:clay', 1]]],
  ['minecraft:crafting_shaped', 'minecraft:bricks', 1, [['minecraft:brick', 4]]],
  ['minecraft:crafting_shaped', 'minecraft:glowstone_dust', 4, [['minecraft:glowstone', 1]]],
  ['minecraft:crafting_shaped', 'minecraft:redstone', 9, [['minecraft:redstone_block', 1]]],
  ['minecraft:crafting_shaped', 'minecraft:coal', 9, [['minecraft:coal_block', 1]]],
  ['minecraft:crafting_shaped', 'minecraft:quartz', 4, [['minecraft:quartz_block', 1]]],
  ['minecraft:crafting_shaped', 'minecraft:diamond', 9, [['minecraft:diamond_block', 1]]],
  ['minecraft:crafting_shaped', 'minecraft:emerald', 9, [['minecraft:emerald_block', 1]]],
  ['minecraft:crafting_shaped', 'minecraft:gold_ingot', 9, [['minecraft:gold_block', 1]]],
  ['minecraft:crafting_shaped', 'minecraft:lapis_lazuli', 9, [['minecraft:lapis_block', 1]]],
  ['minecraft:smelting', 'minecraft:cooked_beef', 1, [['minecraft:beef', 1]]],
  ['minecraft:crafting_shaped', 'minecraft:golden_carrot', 1, [['minecraft:gold_nugget', 8]]],
].map(([type, id, count, inputs]) => ({
  type: type as string,
  output: { id: id as string, count: count as number },
  inputs: (inputs as [string, number][]).map(([input, n]) => ({ id: input, count: n })),
}));

let pool: pg.Pool;

beforeAll(async () => {
  pool = await databaseBefore('lnb_test_market_retune', MIGRATION);
  // An admin edited sand's price, tier 2's thresholds and the mint cap; the license is at its default.
  await pool.query(`UPDATE market_item SET p0 = 0.09 WHERE id = 'minecraft:sand'`);
  await pool.query(`UPDATE market_tier_settings SET q1 = 400000 WHERE tier = 2`);
  await pool.query(`UPDATE market_settings SET mint_cap_percent = 10`);
  await pool.query(`UPDATE economy_settings SET casino_license_price = 10000000`);
  await applyMigration(pool, MIGRATION);
});

afterAll(async () => {
  await pool.end();
});

describe('market retune migration', () => {
  it('retunes the items still at the draft, resets their stock and writes a version', async () => {
    const { rows } = await pool.query(
      `SELECT id, p0::float, p_min::float, p_max::float, s0::float, stock::float FROM market_item WHERE id IN ('minecraft:cobblestone', 'minecraft:ancient_debris')`,
    );
    expect(rows).toContainEqual({
      id: 'minecraft:cobblestone',
      p0: 0.012,
      p_min: 0.0006,
      p_max: 0.036,
      s0: 30000,
      stock: 30000,
    });
    expect(rows).toContainEqual({
      id: 'minecraft:ancient_debris',
      p0: 100,
      p_min: 40,
      p_max: 200,
      s0: 6,
      stock: 6,
    });
    const versions = await pool.query<{ n: string }>(
      `SELECT count(*) AS n FROM market_item_version`,
    );
    expect(Number(versions.rows[0]!.n)).toBe(29);
  });

  it('leaves an item an admin edited alone', async () => {
    const { rows } = await pool.query(
      `SELECT p0::float, s0::float, stock::float FROM market_item WHERE id = 'minecraft:sand'`,
    );
    expect(rows[0]).toEqual({ p0: 0.09, s0: 75000, stock: 75000 });
  });

  it('retunes the tiers and the mint cap only where they are at the draft', async () => {
    const tiers = await pool.query(
      `SELECT tier, q1::int, q2::int, mid_percent, tail_percent FROM market_tier_settings ORDER BY tier`,
    );
    expect(tiers.rows).toEqual([
      { tier: 1, q1: 3500, q2: 9300, mid_percent: 40, tail_percent: 5 },
      { tier: 2, q1: 400000, q2: 1500000, mid_percent: 50, tail_percent: 10 },
      { tier: 3, q1: 3500, q2: 9300, mid_percent: 40, tail_percent: 5 },
    ]);
    const settings = await pool.query<{ cap: number }>(
      `SELECT mint_cap_percent::float AS cap FROM market_settings`,
    );
    expect(settings.rows[0]!.cap).toBe(10);
  });

  it('sets the casino license to 1,050 LNBits from the old default, and the new default too', async () => {
    const { rows } = await pool.query<{ price: number }>(
      `SELECT casino_license_price::int AS price FROM economy_settings`,
    );
    expect(rows[0]!.price).toBe(105_000);
    const column = await pool.query<{ column_default: string }>(
      `SELECT column_default FROM information_schema.columns WHERE table_name = 'economy_settings' AND column_name = 'casino_license_price'`,
    );
    expect(column.rows[0]!.column_default).toBe('105000');
  });

  it('keeps the retuned catalog free of recipe loops', async () => {
    const { rows } = await pool.query(
      `SELECT id, enabled, sellable, buyable, p_min::float AS "pMin", p_max::float AS "pMax" FROM market_item`,
    );
    expect(validateMarketLoops(rows, recipes, 0.15)).toMatchObject({ ok: true, loops: [] });
  });
});
