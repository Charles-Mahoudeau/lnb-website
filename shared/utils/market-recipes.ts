// The loop validator of docs/market.md ("Recipes and the loop validator"): refuses a catalog where
// an item sold to the Market can be crafted for less than it is worth. Pure, so the admin save,
// the recipe upload and the unit tests share it.

export interface MarketRecipe {
  type: string;
  output: { id: string; count: number };
  inputs: { id: string; count: number }[];
}

/** What the validator needs to know of an item. Only enabled items trade. */
export interface MarketRecipeItem {
  id: string;
  enabled: boolean;
  sellable: boolean;
  buyable: boolean;
  pMin: number;
  pMax: number;
}

export interface MarketLoop {
  /** The sellable item that can be crafted for less than its sale price. */
  item: string;
  /** What selling it pays at worst, `pMax × (1 - σ)`. */
  value: number;
  /** What making it costs at best, with the cheapest way to get every input. */
  cost: number;
  /** The recipes that make it, the inputs' own recipes after them. */
  path: MarketRecipe[];
}

export type MarketValidation =
  | { ok: true; loops: [] }
  | { ok: false; reason: 'noRecipes'; loops: [] }
  | { ok: false; reason: 'loop'; loops: MarketLoop[] };

const EPSILON = 1e-9;

/**
 * Worst case: every item is bought at `pMin × (1 + σ)` and sold at `pMax × (1 - σ)`, whatever the
 * stock of the others. An input the Market doesn't sell has no cost, so a recipe needing one is no
 * loop. A cycle of recipes that gains items makes costs fall for ever, so the relaxation stops
 * after one pass per item and the items still falling are loops.
 */
export function validateMarketLoops(
  items: readonly MarketRecipeItem[],
  recipes: readonly MarketRecipe[],
  sigma: number,
): MarketValidation {
  if (!recipes.length) return { ok: false, reason: 'noRecipes', loops: [] };

  const trading = new Map(items.filter((item) => item.enabled).map((item) => [item.id, item]));
  const byOutput = new Map<string, MarketRecipe[]>();
  for (const recipe of recipes) {
    if (recipe.output.count <= 0) continue;
    byOutput.set(recipe.output.id, [...(byOutput.get(recipe.output.id) ?? []), recipe]);
  }

  // Cheapest way to get every item. `skip` is not bought: a loop that starts by buying the item
  // it ends with is only the spread of that item, which the price curve already covers.
  const solve = (skip?: string) => {
    const cost = new Map<string, number>();
    for (const item of trading.values()) {
      if (item.buyable && item.id !== skip) cost.set(item.id, item.pMin * (1 + sigma));
    }
    const via = new Map<string, MarketRecipe>();

    const craftCost = (recipe: MarketRecipe): number => {
      let total = 0;
      for (const input of recipe.inputs) {
        const price = cost.get(input.id);
        if (price === undefined) return Infinity;
        total += price * input.count;
      }
      return total / recipe.output.count;
    };

    // Bellman-Ford: one pass per item settles every cost unless a cycle keeps lowering it.
    const passes = trading.size + byOutput.size + 1;
    for (let pass = 0; pass < passes; pass++) {
      const changed = new Set<string>();
      for (const [output, list] of byOutput) {
        for (const recipe of list) {
          const price = craftCost(recipe);
          if (price < (cost.get(output) ?? Infinity) - EPSILON * Math.max(1, price)) {
            cost.set(output, price);
            via.set(output, recipe);
            changed.add(output);
          }
        }
      }
      if (!changed.size) break;
    }
    return { via, craftCost };
  };

  const base = solve();

  const path = (via: Map<string, MarketRecipe>, item: string): MarketRecipe[] => {
    const steps: MarketRecipe[] = [];
    const seen = new Set<string>();
    const walk = (id: string) => {
      const recipe = via.get(id);
      if (!recipe || seen.has(id)) return;
      seen.add(id);
      steps.push(recipe);
      for (const input of recipe.inputs) walk(input.id);
    };
    walk(item);
    return steps;
  };

  // Crafted: the cheapest of the item's own recipes, whatever buying it would cost.
  const cheapest = (item: MarketRecipeItem, craftCost: (recipe: MarketRecipe) => number) => {
    let best = Infinity;
    let bestRecipe: MarketRecipe | undefined;
    for (const recipe of byOutput.get(item.id) ?? []) {
      const price = craftCost(recipe);
      if (price < best) [best, bestRecipe] = [price, recipe];
    }
    return { best, bestRecipe };
  };

  const loops: MarketLoop[] = [];
  for (const item of trading.values()) {
    if (!item.sellable) continue;
    const value = item.pMax * (1 - sigma);
    let { best, bestRecipe } = cheapest(item, base.craftCost);
    let via = base.via;
    const isLoop = () => bestRecipe && best < value * (1 - EPSILON);
    if (isLoop() && item.buyable) {
      const alone = solve(item.id);
      ({ best, bestRecipe } = cheapest(item, alone.craftCost));
      via = alone.via;
    }
    if (!bestRecipe || !isLoop()) continue;
    const steps = [bestRecipe];
    const seen = new Set([item.id]);
    for (const input of bestRecipe.inputs) {
      for (const step of path(via, input.id)) {
        if (seen.has(step.output.id)) continue;
        seen.add(step.output.id);
        steps.push(step);
      }
    }
    loops.push({ item: item.id, value, cost: best, path: steps });
  }
  return loops.length ? { ok: false, reason: 'loop', loops } : { ok: true, loops: [] };
}
