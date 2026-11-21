import { describe, expect, it } from 'vitest';

import { validateMarketLoops } from '../../shared/utils/market-recipes.ts';
import type { MarketRecipe, MarketRecipeItem } from '../../shared/utils/market-recipes.ts';

const sigma = 0.15;
const item = (id: string, extra: Partial<MarketRecipeItem> = {}): MarketRecipeItem => ({
  id,
  enabled: true,
  sellable: true,
  buyable: false,
  pMin: 0.01,
  pMax: 0.1,
  ...extra,
});
const recipe = (
  output: [string, number],
  inputs: [string, number][],
  type = 'minecraft:crafting_shaped',
): MarketRecipe => ({
  type,
  output: { id: output[0], count: output[1] },
  inputs: inputs.map(([id, count]) => ({ id, count })),
});

describe('market loop validator', () => {
  it('refuses to run without a recipe graph', () => {
    expect(validateMarketLoops([item('a')], [], sigma)).toMatchObject({
      ok: false,
      reason: 'noRecipes',
    });
  });

  it('finds a loop and returns its recipe path', () => {
    // Sand costs at best 0.01 × 1.15, glass sells for at least 0.1 × 0.85: buy, smelt, sell.
    const items = [item('sand', { buyable: true }), item('glass', { pMax: 0.5 })];
    const smelt = recipe(['glass', 1], [['sand', 1]], 'minecraft:smelting');
    const result = validateMarketLoops(items, [smelt], sigma);
    expect(result.ok).toBe(false);
    expect(result.loops).toHaveLength(1);
    expect(result.loops[0]).toMatchObject({ item: 'glass', path: [smelt] });
    expect(result.loops[0]!.cost).toBeCloseTo(0.0115, 9);
  });

  it('finds a loop through two crafts', () => {
    const items = [
      item('stone', { buyable: true, sellable: false }),
      item('bricks', { sellable: false }),
      item('wall', { pMax: 1 }),
    ];
    const first = recipe(['bricks', 1], [['stone', 2]]);
    const second = recipe(['wall', 1], [['bricks', 2]]);
    const result = validateMarketLoops(items, [first, second], sigma);
    expect(result.loops.map((loop) => loop.item)).toEqual(['wall']);
    expect(result.loops[0]!.path).toEqual([second, first]);
  });

  it('accepts a catalog where crafting costs more than selling pays', () => {
    const items = [item('sand', { buyable: true, pMin: 0.5 }), item('glass', { pMax: 0.5 })];
    const result = validateMarketLoops(items, [recipe(['glass', 1], [['sand', 1]])], sigma);
    expect(result).toEqual({ ok: true, loops: [] });
  });

  it('gives no cost to inputs the Market does not sell', () => {
    // No one can buy the ore, so smelting it is play, not a loop.
    const items = [item('ore', { sellable: false }), item('ingot', { pMax: 5 })];
    const result = validateMarketLoops(items, [recipe(['ingot', 1], [['ore', 1]])], sigma);
    expect(result.ok).toBe(true);
  });

  it('ignores disabled items', () => {
    const items = [item('sand', { buyable: true }), item('glass', { pMax: 0.5, enabled: false })];
    expect(validateMarketLoops(items, [recipe(['glass', 1], [['sand', 1]])], sigma).ok).toBe(true);
  });

  it('does not count buying and selling the same item as a loop', () => {
    const items = [item('coal', { buyable: true, pMin: 0.01, pMax: 0.1 })];
    expect(validateMarketLoops(items, [recipe(['x', 1], [['y', 1]])], sigma).ok).toBe(true);
  });

  it('ends on a cycle of recipes, and a cycle that gains items is a loop', () => {
    // Two ingots become one block, one block becomes two ingots: fair, no gain.
    const fair = validateMarketLoops(
      [item('ingot', { buyable: true, pMin: 0.5 }), item('block', { pMax: 0.5 })],
      [recipe(['block', 1], [['ingot', 2]]), recipe(['ingot', 2], [['block', 1]])],
      sigma,
    );
    expect(fair.ok).toBe(true);
    // One block becomes three ingots: every turn gains, and costs fall for ever.
    const gain = validateMarketLoops(
      [item('ingot', { buyable: true, pMin: 0.5 }), item('block', { pMax: 0.5 })],
      [recipe(['block', 1], [['ingot', 2]]), recipe(['ingot', 3], [['block', 1]])],
      sigma,
    );
    expect(gain.ok).toBe(false);
  });

  it('crafts with the cheapest way to get each input', () => {
    // Plank is cheaper crafted from logs than bought; the chest then undercuts its sale price.
    const items = [
      item('log', { buyable: true, pMin: 0.01, sellable: false }),
      item('plank', { buyable: true, pMin: 1, sellable: false }),
      item('chest', { pMax: 1 }),
    ];
    const planks = recipe(['plank', 4], [['log', 1]]);
    const chest = recipe(['chest', 1], [['plank', 8]]);
    const result = validateMarketLoops(items, [planks, chest], sigma);
    expect(result.loops[0]).toMatchObject({ item: 'chest' });
    expect(result.loops[0]!.path).toEqual([chest, planks]);
  });
});
