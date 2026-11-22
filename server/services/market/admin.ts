import { and, asc, desc, eq, gt, ilike, lt, sql } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import type { Tx } from '~~/server/db';
import {
  audit,
  marketItem,
  marketItemVersion,
  marketOrder,
  marketRecipe,
  marketSettings,
  marketTierSettings,
  user,
} from '~~/server/db/schema';
import { auditService } from '~~/server/services/audit';
import { periodStart } from '~~/server/services/economy/rules';

import { marketEvents } from './events';
import { assertValid, validateCatalog } from './recipes';
import {
  bumpRevision,
  curveOf,
  loadConfig,
  mintRemaining,
  priceNow,
  problem,
  stockNow,
  DAY_MS,
} from './shared';
import type { MarketItemRow } from './shared';

import type {
  MarketItemCreateBody,
  MarketItemPatchBody,
  MarketOrdersQuery,
  MarketSettingsPatch,
  MarketValidateBody,
} from '#shared/schemas/market';
import { marketItemName, marketStockForPrice, marketTierDefaults } from '#shared/utils/market';

// What admins do on the Market: items, settings, orders, stats. Every change is audited in its
// transaction, writes a version of the item where it changes the curve, and bumps the revision the
// Minecraft server watches. See docs/market.md.

const PAGE = 50;
const FIELDS = [
  'tier',
  'enabled',
  'sellable',
  'buyable',
  'p0',
  'pMin',
  'pMax',
  's0',
  'sMin',
  'sMax',
  'k',
  'alpha',
] as const;

const adminActor = (userId: string) => ({ source: 'web' as const, userId });
const parameters = (row: MarketItemRow) => Object.fromEntries(FIELDS.map((key) => [key, row[key]]));

function view(row: MarketItemRow, now: Date) {
  return {
    ...parameters(row),
    id: row.id,
    name: marketItemName(row.id),
    tier: row.tier as 1 | 2 | 3,
    stock: stockNow(row, now),
    stockAt: now.toISOString(),
    price: priceNow(row, now),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function overview() {
  const now = new Date();
  const [settings, items] = await Promise.all([
    loadConfig(db),
    db.select().from(marketItem).orderBy(asc(marketItem.tier), asc(marketItem.id)),
  ]);
  return {
    settings: {
      sigmaPercent: settings.sigma * 100,
      tolerancePercent: settings.tolerancePercent,
      maxOrderItems: settings.maxOrderItems,
      mintCapPercent: settings.mintCapPercent,
      historyDays: settings.historyDays,
      revision: settings.revision,
      tiers: settings.tiers,
      updatedAt: settings.updatedAt.toISOString(),
    },
    items: items.map((row) => view(row, now)),
  };
}

async function writeVersion(tx: Tx, row: MarketItemRow, adminId: string) {
  await tx
    .insert(marketItemVersion)
    .values({ itemId: row.id, parameters: parameters(row), changedByUserId: adminId });
}

async function createItem(adminId: string, body: MarketItemCreateBody) {
  const defaults = marketTierDefaults(body.tier, body.p0, body.s0);
  const values = {
    ...defaults,
    ...body,
  } as typeof marketItem.$inferInsert;
  const row = await db.transaction(async (tx) => {
    const [existing] = await tx
      .select({ id: marketItem.id })
      .from(marketItem)
      .where(eq(marketItem.id, body.id));
    if (existing) problem(409, 'itemExists');
    await assertValid(tx, [
      {
        id: body.id,
        enabled: values.enabled,
        sellable: values.sellable,
        buyable: values.buyable,
        pMin: values.pMin,
        pMax: values.pMax,
      },
    ]);
    // A new item starts at its equilibrium.
    const [created] = await tx
      .insert(marketItem)
      .values({ ...values, stock: body.s0 })
      .returning();
    await writeVersion(tx, created!, adminId);
    await bumpRevision(tx, adminId);
    await auditService.record(tx, {
      action: 'economy.market.itemCreate',
      actor: adminActor(adminId),
      data: { name: marketItemName(body.id), item: body.id },
    });
    return created!;
  });
  await marketEvents.configChanged();
  return view(row, new Date());
}

/** A change that can only close doors can't open a loop, so it needs no validation. */
const restrictive = (patch: Record<string, unknown>) =>
  Object.entries(patch).every(
    ([key, value]) =>
      key === 'keepPrice' || (['enabled', 'sellable', 'buyable'].includes(key) && value === false),
  );

async function updateItem(adminId: string, id: string, body: MarketItemPatchBody) {
  const { keepPrice = true, ...patch } = body;
  const row = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(marketItem).where(eq(marketItem.id, id)).for('update');
    if (!current) problem(404, 'notFound');
    const now = new Date();
    const next = { ...current, ...patch };
    const bounds = [
      next.pMin <= next.p0,
      next.p0 <= next.pMax,
      next.sMin <= next.s0,
      next.s0 <= next.sMax,
    ];
    if (bounds.includes(false)) throw createError({ status: 400, statusText: 'Bad Request' });
    if (!restrictive(body)) await assertValid(tx, [{ id, ...patch }]);
    // The drift is applied now, under the old curve; the new curve then starts from there.
    const drifted = stockNow(current, now);
    const curveChanged = FIELDS.some((key) => key in patch && patch[key] !== current[key]);
    let stock = drifted;
    if (curveChanged) {
      stock = keepPrice ? marketStockForPrice(curveOf(next), priceNow(current, now)) : drifted;
      stock = Math.min(next.sMax, Math.max(next.sMin, stock));
    }
    const [updated] = await tx
      .update(marketItem)
      .set({ ...patch, stock, stockAt: now, updatedAt: now })
      .where(eq(marketItem.id, id))
      .returning();
    await writeVersion(tx, updated!, adminId);
    await bumpRevision(tx, adminId);
    await auditService.record(tx, {
      action: 'economy.market.itemUpdate',
      actor: adminActor(adminId),
      data: { name: marketItemName(id), item: id, fields: Object.keys(patch), keepPrice },
    });
    return updated!;
  });
  await marketEvents.configChanged();
  return view(row, new Date());
}

async function resetStock(adminId: string, id: string, reason: string) {
  const row = await db.transaction(async (tx) => {
    const [current] = await tx.select().from(marketItem).where(eq(marketItem.id, id)).for('update');
    if (!current) problem(404, 'notFound');
    const [updated] = await tx
      .update(marketItem)
      .set({ stock: current.s0, stockAt: new Date() })
      .where(eq(marketItem.id, id))
      .returning();
    await auditService.record(tx, {
      action: 'economy.market.itemResetStock',
      actor: adminActor(adminId),
      data: { name: marketItemName(id), item: id, from: current.stock, reason },
    });
    return updated!;
  });
  marketEvents.stockChanged(id, row.stock, row.stockAt);
  return view(row, new Date());
}

async function updateSettings(adminId: string, patch: MarketSettingsPatch) {
  await db.transaction(async (tx) => {
    // The spread decides which loops exist: the new one is checked before it is stored.
    // The form sends every field, so only a spread that really changes needs the check.
    const { sigma } = await loadConfig(tx);
    if (patch.sigmaPercent !== undefined && Math.abs(patch.sigmaPercent - sigma * 100) > 1e-9) {
      await assertValid(tx, [], patch.sigmaPercent);
    }
    const { tiers, ...single } = patch;
    if (Object.keys(single).length) {
      await tx.update(marketSettings).set(single).where(eq(marketSettings.id, 1));
    }
    for (const tier of tiers ?? []) {
      await tx
        .insert(marketTierSettings)
        .values(tier)
        .onConflictDoUpdate({ target: marketTierSettings.tier, set: tier });
    }
    await bumpRevision(tx, adminId);
    await auditService.record(tx, {
      action: 'economy.market.settings',
      actor: adminActor(adminId),
      data: { fields: [...Object.keys(single), ...(tiers ? ['tiers'] : [])] },
    });
  });
  await marketEvents.configChanged();
  return overview();
}

/** Dry run of the loop validator on changes that aren't saved. */
function validate(body: MarketValidateBody) {
  return validateCatalog(db, body.items, body.sigmaPercent);
}

/** The lowest rate a sale was paid at, from the answer the order stored. */
function lowestRate(result: Record<string, unknown>): number | null {
  const brackets = result.brackets;
  if (!Array.isArray(brackets) || !brackets.length) return null;
  return Math.min(...brackets.map((part: { rate: number }) => part.rate));
}

async function orders(query: MarketOrdersQuery) {
  const rows = await db
    .select({ order: marketOrder, name: user.name })
    .from(marketOrder)
    .leftJoin(user, eq(user.id, marketOrder.userId))
    .where(
      and(
        query.cursor ? lt(marketOrder.id, Number(query.cursor)) : undefined,
        query.item ? eq(marketOrder.itemId, query.item) : undefined,
        query.direction ? eq(marketOrder.direction, query.direction) : undefined,
        query.capped ? eq(marketOrder.capped, true) : undefined,
        query.q ? ilike(user.name, `%${query.q.replace(/[%_\\]/g, '\\$&')}%`) : undefined,
      ),
    )
    .orderBy(desc(marketOrder.id))
    .limit(PAGE + 1);
  const page = rows.slice(0, PAGE);
  return {
    items: page.map(({ order, name }) => ({
      id: order.id,
      at: order.createdAt.toISOString(),
      userId: order.userId,
      name: name ?? '',
      item: order.itemId,
      direction: order.direction,
      quantity: order.quantity,
      total: order.total,
      capped: order.capped,
      rate: lowestRate(order.result),
      transactionId: order.transactionId,
      stockBefore: order.stockBefore,
      stockAfter: order.stockAfter,
    })),
    nextCursor: rows.length > PAGE ? String(page.at(-1)!.order.id) : null,
  };
}

async function stats(period: '7d' | '30d' | '90d' | 'all') {
  const since = periodStart(period);
  const where = since ? gt(marketOrder.createdAt, since) : undefined;
  const now = new Date();
  const [days, perItem, sellers, items, config, today, recipes] = await Promise.all([
    db
      .select({
        day: sql<string>`to_char(${marketOrder.createdAt} at time zone 'Europe/Paris', 'YYYY-MM-DD')`,
        minted: sql<number>`coalesce(sum(${marketOrder.total}) filter (where ${marketOrder.direction} = 'sell'), 0)::float8`,
        burned: sql<number>`coalesce(sum(${marketOrder.total}) filter (where ${marketOrder.direction} = 'buy'), 0)::float8`,
      })
      .from(marketOrder)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(sql`1`),
    db
      .select({
        item: marketOrder.itemId,
        minted: sql<number>`coalesce(sum(${marketOrder.total}) filter (where ${marketOrder.direction} = 'sell'), 0)::float8`,
        burned: sql<number>`coalesce(sum(${marketOrder.total}) filter (where ${marketOrder.direction} = 'buy'), 0)::float8`,
        sold: sql<number>`coalesce(sum(${marketOrder.quantity}) filter (where ${marketOrder.direction} = 'sell'), 0)::float8`,
        bought: sql<number>`coalesce(sum(${marketOrder.quantity}) filter (where ${marketOrder.direction} = 'buy'), 0)::float8`,
      })
      .from(marketOrder)
      .where(where)
      .groupBy(marketOrder.itemId)
      .orderBy(desc(sql`2`)),
    db
      .select({
        userId: marketOrder.userId,
        name: user.name,
        minted: sql<number>`sum(${marketOrder.total})::float8`,
      })
      .from(marketOrder)
      .leftJoin(user, eq(user.id, marketOrder.userId))
      .where(and(where, eq(marketOrder.direction, 'sell')))
      .groupBy(marketOrder.userId, user.name)
      .orderBy(desc(sql`3`))
      .limit(10),
    db.select().from(marketItem).orderBy(asc(marketItem.tier), asc(marketItem.id)),
    loadConfig(db),
    db
      .select({
        orders: sql<number>`count(*)::int`,
        capped: sql<number>`(count(*) filter (where ${marketOrder.capped}))::int`,
      })
      .from(marketOrder)
      .where(gt(marketOrder.createdAt, new Date(now.getTime() - DAY_MS))),
    recipeInfo(),
  ]);
  return {
    period,
    today: today[0] ?? { orders: 0, capped: 0 },
    recipes,
    days,
    items: perItem,
    volume: {
      orders: perItem.length ? await orderCount(where) : 0,
      minted: days.reduce((sum, day) => sum + day.minted, 0),
      burned: days.reduce((sum, day) => sum + day.burned, 0),
    },
    mintCap: await mintRemaining(db, config, now),
    topSellers: sellers.map((row) => ({ ...row, name: row.name ?? '' })),
    stocks: items.map((row) => ({
      item: row.id,
      tier: row.tier,
      stock: stockNow(row, now),
      s0: row.s0,
      price: priceNow(row, now),
    })),
  };
}

/** How many recipes are stored, and when the Minecraft server last changed the list. */
async function recipeInfo() {
  const [[count], [last]] = await Promise.all([
    db.select({ total: sql<number>`count(*)::int` }).from(marketRecipe),
    db
      .select({ at: audit.at })
      .from(audit)
      .where(eq(audit.action, 'economy.market.recipes'))
      .orderBy(desc(audit.id))
      .limit(1),
  ]);
  return { total: count?.total ?? 0, updatedAt: last?.at.toISOString() ?? null };
}

async function orderCount(where: ReturnType<typeof gt> | undefined): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(marketOrder)
    .where(where);
  return row?.n ?? 0;
}

export const marketAdminService = {
  overview,
  createItem,
  updateItem,
  resetStock,
  updateSettings,
  validate,
  orders,
  stats,
};
