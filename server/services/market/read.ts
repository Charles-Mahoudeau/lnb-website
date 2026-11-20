import { and, asc, eq, gt, isNull } from 'drizzle-orm';

import { db } from '~~/server/db';
import { marketItem, marketSnapshot, minecraftAccount } from '~~/server/db/schema';
import { economyAccountService } from '~~/server/services/economy/accounts';
import { ownerOf } from '~~/server/services/economy/server';
import { refuse } from '~~/server/services/economy/shared';
import { flagService } from '~~/server/services/flags';

import { requireMarketFlags } from './orders';
import {
  bracketsOf,
  curveOf,
  DAY_MS,
  loadConfig,
  mintRemaining,
  priceNow,
  problem,
  stockNow,
  windowsOf,
} from './shared';
import type { MarketConfig } from './shared';

import type { MarketPublic, MarketState, MarketTierWindowView } from '#shared/schemas/market';
import {
  marketItemName,
  marketQuotePurchase,
  marketQuoteSale,
  marketRate,
} from '#shared/utils/market';

// What the Minecraft server and the public page read: the state, a player's window, the prices of
// every item and their history. See docs/market.md.

/** A player's window and rate in each tier, for the mod's efficiency display and the page. */
function tierWindows(config: MarketConfig, windows: Map<number, number>): MarketTierWindowView[] {
  return config.tiers.map((tier) => {
    const nominal = windows.get(tier.tier) ?? 0;
    return { tier: tier.tier, nominal, ...marketRate(bracketsOf(config, tier.tier), nominal) };
  });
}

/** Everything the mod needs to price: settings, tiers, the mint budget and every enabled item. */
async function state(): Promise<MarketState> {
  await requireMarketFlags();
  const now = new Date();
  const config = await loadConfig(db);
  const [items, budget, sell, buy] = await Promise.all([
    db.select().from(marketItem).where(eq(marketItem.enabled, true)).orderBy(asc(marketItem.id)),
    mintRemaining(db, config, now),
    flagService.isEnabled('economy.market.sell'),
    flagService.isEnabled('economy.market.buy'),
  ]);
  return {
    revision: config.revision,
    asOf: now.toISOString(),
    settings: {
      sigma: config.sigma,
      tolerancePercent: config.tolerancePercent,
      maxOrderItems: config.maxOrderItems,
      sell,
      buy,
    },
    tiers: config.tiers,
    mintRemaining: budget.remaining,
    // Drifted to `asOf`, so `stockAt` is `asOf`: the mod drifts from there.
    items: items.map((row) => ({
      id: row.id,
      tier: row.tier as 1 | 2 | 3,
      sellable: row.sellable,
      buyable: row.buyable,
      p0: row.p0,
      pMin: row.pMin,
      pMax: row.pMax,
      s0: row.s0,
      sMin: row.sMin,
      sMax: row.sMax,
      k: row.k,
      alpha: row.alpha,
      stock: stockNow(row, now),
      stockAt: now.toISOString(),
    })),
  };
}

/** A player's window in every tier, by Minecraft UUID. */
async function playerWindow(uuid: string) {
  await requireMarketFlags();
  const userId = await ownerOf(db, uuid);
  if (!(await economyAccountService.isEligible(db, userId))) refuse(403, 'notEligible');
  return windowOf(userId);
}

async function windowOf(userId: string) {
  const now = new Date();
  const config = await loadConfig(db);
  const [windows, budget] = await Promise.all([
    windowsOf(db, userId, now),
    mintRemaining(db, config, now),
  ]);
  return { tiers: tierWindows(config, windows), capped: budget.remaining <= 0 };
}

/** The public page: every enabled item with its price, what 1 and 64 would trade for, a sparkline. */
async function publicOverview(userId?: string): Promise<MarketPublic> {
  await requireMarketFlags();
  const now = new Date();
  const config = await loadConfig(db);
  const [items, snapshots, sell, buy] = await Promise.all([
    db
      .select()
      .from(marketItem)
      .where(eq(marketItem.enabled, true))
      .orderBy(asc(marketItem.tier), asc(marketItem.id)),
    db
      .select({ itemId: marketSnapshot.itemId, price: marketSnapshot.price })
      .from(marketSnapshot)
      .where(gt(marketSnapshot.at, new Date(now.getTime() - DAY_MS)))
      .orderBy(asc(marketSnapshot.at)),
    flagService.isEnabled('economy.market.sell'),
    flagService.isEnabled('economy.market.buy'),
  ]);
  const sparks = new Map<string, number[]>();
  for (const row of snapshots)
    sparks.set(row.itemId, [...(sparks.get(row.itemId) ?? []), row.price]);

  let me: MarketPublic['me'];
  if (userId) {
    const [linked] = await db
      .select({ uuid: minecraftAccount.uuid })
      .from(minecraftAccount)
      .where(and(eq(minecraftAccount.userId, userId), isNull(minecraftAccount.unlinkedAt)))
      .limit(1);
    if (linked) me = await windowOf(userId);
  }
  const rows = items.map((row) => {
    const curve = curveOf(row);
    const stock = stockNow(row, now);
    const brackets = bracketsOf(config, row.tier);
    const sold = (quantity: number) =>
      marketQuoteSale(curve, config.sigma, brackets, stock, 0, quantity).total;
    const bought = (quantity: number) =>
      marketQuotePurchase(curve, config.sigma, stock, quantity).total;
    const price = priceNow(row, now);
    return {
      id: row.id,
      name: marketItemName(row.id),
      tier: row.tier,
      sellable: row.sellable,
      buyable: row.buyable,
      price,
      p0: row.p0,
      deltaPercent: ((price - row.p0) / row.p0) * 100,
      sell: { one: sold(1), stack: sold(64) },
      buy: { one: bought(1), stack: bought(64) },
      sparkline: [...(sparks.get(row.id) ?? []), price],
    };
  });
  return { items: rows, sell, buy, ...(me ? { me } : {}) };
}

const PERIODS = {
  '24h': { ms: DAY_MS, bucketMs: 0 },
  '7d': { ms: 7 * DAY_MS, bucketMs: 0 },
  '30d': { ms: 30 * DAY_MS, bucketMs: 4 * 3_600_000 },
  '1y': { ms: 365 * DAY_MS, bucketMs: DAY_MS },
} as const;

/** An item's price over time, from the hourly snapshots, averaged per bucket on the long periods. */
async function history(itemId: string, period: keyof typeof PERIODS) {
  await requireMarketFlags();
  const [item] = await db
    .select()
    .from(marketItem)
    .where(and(eq(marketItem.id, itemId), eq(marketItem.enabled, true)));
  if (!item) problem(404, 'notFound');
  const { ms, bucketMs } = PERIODS[period];
  const rows = await db
    .select({ at: marketSnapshot.at, price: marketSnapshot.price, stock: marketSnapshot.stock })
    .from(marketSnapshot)
    .where(and(eq(marketSnapshot.itemId, itemId), gt(marketSnapshot.at, new Date(Date.now() - ms))))
    .orderBy(asc(marketSnapshot.at));
  if (!bucketMs) {
    return {
      period,
      points: rows.map((row) => ({ at: row.at.toISOString(), price: row.price, stock: row.stock })),
    };
  }
  const buckets = new Map<number, { n: number; price: number; stock: number }>();
  for (const row of rows) {
    const key = Math.floor(row.at.getTime() / bucketMs) * bucketMs;
    const bucket = buckets.get(key) ?? { n: 0, price: 0, stock: 0 };
    bucket.n += 1;
    bucket.price += row.price;
    bucket.stock += row.stock;
    buckets.set(key, bucket);
  }
  return {
    period,
    points: [...buckets].map(([at, bucket]) => ({
      at: new Date(at).toISOString(),
      price: bucket.price / bucket.n,
      stock: bucket.stock / bucket.n,
    })),
  };
}

export const marketReadService = { state, playerWindow, windowOf, publicOverview, history };
