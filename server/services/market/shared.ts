import { and, eq, gt, sql, sum } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import type { Db, Tx } from '~~/server/db';
import type { marketItem } from '~~/server/db/schema';
import { marketOrder, marketSale, marketSettings, marketTierSettings } from '~~/server/db/schema';
import { circulation } from '~~/server/services/quests/shared';

import type { EconomyProblem } from '#shared/schemas/economy';
import { marketDrift, marketPRef } from '#shared/utils/market';
import type { MarketBrackets, MarketCurve } from '#shared/utils/market';

// What every part of the Market reads: the settings, an item's curve, the player's window and the
// mint budget. See docs/market.md.

export type MarketItemRow = typeof marketItem.$inferSelect;

export const DAY_MS = 24 * 60 * 60 * 1000;

/** A problem with an HTTP status, as the economy answers them. */
export function problem(status: number, code: EconomyProblem | 'priceChanged', data = {}): never {
  throw createError({ status, statusText: code, data: { problem: code, ...data } });
}

export interface MarketConfig {
  sigma: number;
  tolerancePercent: number;
  maxOrderItems: number;
  mintCapPercent: number;
  historyDays: number;
  revision: number;
  updatedAt: Date;
  tiers: {
    tier: number;
    q1: number;
    q2: number;
    midPercent: number;
    tailPercent: number;
  }[];
}

/** The settings and the tiers' windows. The migration creates them. */
export async function loadConfig(dbx: Db): Promise<MarketConfig> {
  const [settings] = await dbx.select().from(marketSettings).where(eq(marketSettings.id, 1));
  if (!settings) throw new Error('The Market settings are missing.');
  const tiers = await dbx.select().from(marketTierSettings).orderBy(marketTierSettings.tier);
  return {
    sigma: settings.sigmaPercent / 100,
    tolerancePercent: settings.tolerancePercent,
    maxOrderItems: settings.maxOrderItems,
    mintCapPercent: settings.mintCapPercent,
    historyDays: settings.historyDays,
    revision: settings.revision,
    updatedAt: settings.updatedAt,
    tiers,
  };
}

/** Raises the revision the Minecraft server watches. Call it in the transaction of a config change. */
export async function bumpRevision(tx: Tx, actorId: string | null = null): Promise<number> {
  const [row] = await tx
    .update(marketSettings)
    .set({
      revision: sql`${marketSettings.revision} + 1`,
      updatedAt: new Date(),
      ...(actorId ? { updatedByUserId: actorId } : {}),
    })
    .where(eq(marketSettings.id, 1))
    .returning({ revision: marketSettings.revision });
  return row?.revision ?? 0;
}

export function curveOf(row: MarketItemRow): MarketCurve {
  return {
    p0: row.p0,
    pMin: row.pMin,
    pMax: row.pMax,
    s0: row.s0,
    sMin: row.sMin,
    sMax: row.sMax,
    k: row.k,
    alpha: row.alpha,
  };
}

/** A tier's thresholds in LNBits and its rates as fractions, for the pricing functions. */
export function bracketsOf(config: MarketConfig, tier: number): MarketBrackets {
  const found = config.tiers.find((entry) => entry.tier === tier);
  if (!found) throw new Error(`The Market has no settings for tier ${String(tier)}.`);
  return {
    q1: found.q1 / 100,
    q2: found.q2 / 100,
    mid: found.midPercent / 100,
    tail: found.tailPercent / 100,
  };
}

/** The item's stock now: what was stored, drifted toward s0 since. */
export function stockNow(row: MarketItemRow, now: Date): number {
  return marketDrift(curveOf(row), row.stock, row.stockAt, now);
}

export function priceNow(row: MarketItemRow, now: Date): number {
  return marketPRef(curveOf(row), stockNow(row, now));
}

/** The nominal value a player sold in each tier over the last 24 hours, in LNBits. */
export async function windowsOf(dbx: Db, userId: string, now: Date): Promise<Map<number, number>> {
  const rows = await dbx
    .select({ tier: marketSale.tier, nominal: sum(marketSale.nominal) })
    .from(marketSale)
    .where(
      and(
        eq(marketSale.userId, userId),
        gt(marketSale.createdAt, new Date(now.getTime() - DAY_MS)),
      ),
    )
    .groupBy(marketSale.tier);
  return new Map(rows.map((row) => [row.tier, Number(row.nominal ?? 0)]));
}

/** Cents the Market may still mint: its share of the money in circulation, less the last 30 days. */
export async function mintRemaining(dbx: Db, config: MarketConfig, now: Date) {
  const [spent] = await dbx
    .select({ total: sum(marketOrder.total) })
    .from(marketOrder)
    .where(
      and(
        eq(marketOrder.direction, 'sell'),
        gt(marketOrder.createdAt, new Date(now.getTime() - 30 * DAY_MS)),
      ),
    );
  const cap = Math.floor(((await circulation(dbx)) * config.mintCapPercent) / 100);
  const used = Number(spent?.total ?? 0);
  return { cap, used, remaining: Math.max(0, cap - used) };
}
