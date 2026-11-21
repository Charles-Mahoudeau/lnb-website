import { createHash } from 'node:crypto';

import { asc, eq, or, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import type { Db } from '~~/server/db';
import { marketItem, marketRecipe } from '~~/server/db/schema';
import { auditService } from '~~/server/services/audit';

import { marketEvents } from './events';
import { bumpRevision, loadConfig, problem } from './shared';

import type { MarketRecipeBody, MarketValidationView } from '#shared/schemas/market';
import { validateMarketLoops } from '#shared/utils/market-recipes';
import type { MarketRecipe, MarketRecipeItem } from '#shared/utils/market-recipes';

// The recipe graph the Minecraft server sends, and the validator that keeps loops out of the
// catalog (docs/market.md, "Recipes and the loop validator").

/** A change to try: the item's new fields, or a new item's. */
export type ProposedItem = Partial<Omit<MarketRecipeItem, 'id'>> & { id: string };

export async function storedRecipes(dbx: Db): Promise<MarketRecipe[]> {
  const rows = await dbx.select().from(marketRecipe).orderBy(asc(marketRecipe.id));
  return rows.map((row) => ({
    type: row.type,
    output: { id: row.outputId, count: row.outputCount },
    inputs: row.inputs,
  }));
}

/**
 * Runs the validator on the stored recipes and the stored catalog with `proposed` applied, at the
 * stored spread (or `sigmaPercent`). A proposed item that isn't stored yet needs its prices.
 */
export async function validateCatalog(
  dbx: Db,
  proposed: readonly ProposedItem[] = [],
  sigmaPercent?: number,
): Promise<MarketValidationView> {
  const [rows, recipes, config] = await Promise.all([
    dbx.select().from(marketItem),
    storedRecipes(dbx),
    loadConfig(dbx),
  ]);
  const items = new Map<string, MarketRecipeItem>(
    rows.map((row) => [
      row.id,
      {
        id: row.id,
        enabled: row.enabled,
        sellable: row.sellable,
        buyable: row.buyable,
        pMin: row.pMin,
        pMax: row.pMax,
      },
    ]),
  );
  for (const change of proposed) {
    const base = items.get(change.id);
    if (!base && (change.pMin === undefined || change.pMax === undefined)) {
      problem(400, 'itemExists');
    }
    items.set(change.id, {
      id: change.id,
      enabled: change.enabled ?? base?.enabled ?? true,
      sellable: change.sellable ?? base?.sellable ?? true,
      buyable: change.buyable ?? base?.buyable ?? false,
      pMin: change.pMin ?? base!.pMin,
      pMax: change.pMax ?? base!.pMax,
    });
  }
  const sigma = (sigmaPercent ?? config.sigma * 100) / 100;
  const result = validateMarketLoops([...items.values()], recipes, sigma);
  return {
    ok: result.ok,
    reason: result.ok ? null : result.reason,
    loops: result.loops,
  };
}

/** Refuses a catalog change that allows a loop (409 `loop`, with the paths) or runs on no graph. */
export async function assertValid(
  dbx: Db,
  proposed: readonly ProposedItem[] = [],
  sigmaPercent?: number,
): Promise<void> {
  const result = await validateCatalog(dbx, proposed, sigmaPercent);
  if (result.reason === 'noRecipes') problem(409, 'noRecipes');
  if (result.reason === 'loop') problem(409, 'loop', { loops: result.loops });
}

const canonical = (recipes: readonly MarketRecipe[]) =>
  createHash('sha256').update(JSON.stringify(recipes)).digest('hex');

/**
 * Replaces the stored graph with the Minecraft server's, then answers what the validator finds.
 * A graph identical to the stored one changes nothing, so a restart of the server is no event.
 */
async function replace(body: MarketRecipeBody) {
  const incoming: MarketRecipe[] = body.recipes.map((recipe) => ({
    type: recipe.type,
    output: recipe.output,
    inputs: recipe.inputs,
  }));
  const changed = await db.transaction(async (tx) => {
    // One upload at a time: two servers must not interleave their delete and insert.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('market:recipes', 0))`);
    if (canonical(await storedRecipes(tx)) === canonical(incoming)) return false;
    await tx.delete(marketRecipe);
    for (let from = 0; from < incoming.length; from += 1000) {
      await tx.insert(marketRecipe).values(
        incoming.slice(from, from + 1000).map((recipe) => ({
          type: recipe.type,
          outputId: recipe.output.id,
          outputCount: recipe.output.count,
          inputs: recipe.inputs,
        })),
      );
    }
    await bumpRevision(tx);
    await auditService.record(tx, {
      action: 'economy.market.recipes',
      actor: { source: 'minecraft', userId: null, minecraft: null },
      data: { recipes: incoming.length },
    });
    return true;
  });
  if (changed) await marketEvents.configChanged();
  const validation = await validateCatalog(db);
  return { stored: incoming.length, changed, problems: validation.loops };
}

/** The stored graph, or the recipes that make or use one item. */
async function list(item?: string, uses?: string) {
  const query = db.select().from(marketRecipe);
  const filters = [
    item ? eq(marketRecipe.outputId, item) : undefined,
    uses ? sql`${marketRecipe.inputs} @> ${JSON.stringify([{ id: uses }])}::jsonb` : undefined,
  ].filter((filter) => filter !== undefined);
  // Recipes that make the item and recipes that use it, when both are asked for.
  const rows = await (filters.length ? query.where(or(...filters)) : query)
    .orderBy(asc(marketRecipe.id))
    .limit(500);
  const [{ total } = { total: 0 }] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(marketRecipe);
  return {
    total,
    items: rows.map((row) => ({
      type: row.type,
      output: { id: row.outputId, count: row.outputCount },
      inputs: row.inputs,
    })),
  };
}

export const marketRecipeService = { replace, list, validate: validateCatalog };
