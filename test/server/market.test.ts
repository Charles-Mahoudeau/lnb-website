import { randomUUID } from 'node:crypto';

import { eq, inArray, sql } from 'drizzle-orm';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import {
  economyAccount,
  economyMailboxItem,
  economySettings,
  featureFlag,
  marketItem,
  marketItemVersion,
  marketOrder,
  marketRecipe,
  marketSale,
  marketSettings,
  marketSnapshot,
  minecraftAccount,
  user,
  wardenBan,
} from '~~/server/db/schema';
import { offlineUuid } from '~~/server/lib/minecraft';
import { economyServerService } from '~~/server/services/economy/server';
import { flagService } from '~~/server/services/flags';
import { marketAdminService } from '~~/server/services/market/admin';
import { marketEvents } from '~~/server/services/market/events';
import { marketJobs } from '~~/server/services/market/jobs';
import { marketOrderService } from '~~/server/services/market/orders';
import { marketReadService } from '~~/server/services/market/read';
import { marketRecipeService } from '~~/server/services/market/recipes';
import { circulation } from '~~/server/services/quests/shared';

// The Market's engine end to end, on the seeded catalog. See docs/market.md.

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const COBBLE = 'minecraft:cobblestone';
let counter = 0;
let admin = '';

async function player() {
  const n = ++counter;
  const id = `market-${String(n)}-${String(Date.now())}`;
  const username = `Mkt${String(Date.now() % 100000)}x${String(n)}`.slice(0, 16);
  const uuid = offlineUuid(username);
  await db
    .insert(user)
    .values({ id, name: 'Market Tester', email: `${id}@epitech.eu`, tenantId: EPITECH });
  await db.insert(minecraftAccount).values({ uuid, userId: id, username });
  const { defaultAccountId } = await economyServerService.lookup(uuid);
  return { id, uuid, account: defaultAccountId };
}

const balanceOf = async (accountId: string) =>
  (await db.select().from(economyAccount).where(eq(economyAccount.id, accountId)))[0]!.balance;

const sell = (who: { uuid: string }, quantity: number, expectedTotal = 0, key = randomUUID()) =>
  marketOrderService.order({
    player: who.uuid,
    item: COBBLE,
    direction: 'sell',
    quantity,
    expectedTotal,
    idempotencyKey: key,
  });

const buy = (who: { uuid: string }, quantity: number, expectedTotal: number, key = randomUUID()) =>
  marketOrderService.order({
    player: who.uuid,
    item: COBBLE,
    direction: 'buy',
    quantity,
    expectedTotal,
    idempotencyKey: key,
  });

async function stockOf(item = COBBLE) {
  return (await db.select().from(marketItem).where(eq(marketItem.id, item)))[0]!;
}

async function setFlags(enabled: boolean) {
  for (const key of ['economy.market', 'economy.market.sell', 'economy.market.buy'] as const) {
    await flagService.set({ key, enabled, actorId: admin });
  }
}

beforeAll(async () => {
  await db
    .update(economySettings)
    .set({ startingBalance: 100_000 })
    .where(eq(economySettings.id, 1));
  await db
    .update(marketSettings)
    .set({ mintCapPercent: 100, tolerancePercent: 1 })
    .where(eq(marketSettings.id, 1));
  admin = (await player()).id;
});

afterAll(async () => {
  await db.update(economySettings).set({ startingBalance: 0 }).where(eq(economySettings.id, 1));
  await db.update(marketSettings).set({ mintCapPercent: 25 }).where(eq(marketSettings.id, 1));
  await db.delete(marketRecipe);
  const test = (await db.select({ id: marketItem.id }).from(marketItem))
    .filter((row) => row.id.startsWith('test:'))
    .map((row) => row.id);
  if (test.length) {
    await db.delete(marketItemVersion).where(inArray(marketItemVersion.itemId, test));
    await db.delete(marketItem).where(inArray(marketItem.id, test));
  }
  // The Market ships off.
  for (const key of ['economy.market', 'economy.market.sell', 'economy.market.buy'] as const) {
    await db.update(featureFlag).set({ enabled: false }).where(eq(featureFlag.key, key));
  }
});

describe('the Market', () => {
  it('ships off: every order and read is a 503 disabled', async () => {
    const who = await player();
    await expect(sell(who, 10)).rejects.toMatchObject({
      statusCode: 503,
      data: { problem: 'disabled' },
    });
    await expect(marketReadService.state()).rejects.toMatchObject({ statusCode: 503 });
    await setFlags(true);
  });

  it('sells: mints into the personal account, writes the order and moves the stock', async () => {
    const who = await player();
    const before = await stockOf();
    const quote = await marketOrderService.quote({
      player: who.uuid,
      item: COBBLE,
      direction: 'sell',
      quantity: 1000,
    });
    expect(quote.total).toBeGreaterThan(0);
    const result = await sell(who, 1000, quote.total);
    expect(result).toMatchObject({ replayed: false, direction: 'sell', capped: false });
    expect(result.total).toBe(quote.total);
    expect(await balanceOf(who.account)).toBe(100_000 + result.total);
    const after = await stockOf();
    expect(after.stock).toBeGreaterThan(before.stock);
    const [order] = await db
      .select()
      .from(marketOrder)
      .where(eq(marketOrder.transactionId, result.transactionId));
    expect(order).toMatchObject({ total: result.total, direction: 'sell', quantity: 1000 });
    const sales = await db.select().from(marketSale).where(eq(marketSale.userId, who.id));
    expect(sales).toHaveLength(1);
    expect(sales[0]!.nominal).toBeGreaterThan(0);
  });

  it('replays the same key, and refuses it for another request', async () => {
    const who = await player();
    const key = randomUUID();
    const first = await sell(who, 200, 0, key);
    const again = await sell(who, 200, 0, key);
    expect(again).toMatchObject({
      replayed: true,
      transactionId: first.transactionId,
      total: first.total,
    });
    expect(await balanceOf(who.account)).toBe(100_000 + first.total);
    await expect(sell(who, 201, 0, key)).rejects.toMatchObject({
      statusCode: 409,
      data: { problem: 'idempotencyMismatch' },
    });
  });

  it('buys: burns, hands the items over through the mailbox, lowers the stock', async () => {
    const who = await player();
    await db.update(marketItem).set({ buyable: true }).where(eq(marketItem.id, COBBLE));
    const before = await stockOf();
    const quote = await marketOrderService.quote({
      player: who.uuid,
      item: COBBLE,
      direction: 'buy',
      quantity: 64,
    });
    const result = await buy(who, 64, quote.total);
    expect(await balanceOf(who.account)).toBe(100_000 - result.total);
    const [mail] = await db
      .select()
      .from(economyMailboxItem)
      .where(eq(economyMailboxItem.id, result.mailboxItemId!));
    expect(mail).toMatchObject({ userId: who.id, itemId: COBBLE, count: 64, reason: 'market' });
    expect((await stockOf()).stock).toBeLessThan(before.stock);
  });

  it('refuses a worse price beyond the tolerance, with the new quote, and accepts one within', async () => {
    const who = await player();
    const quote = await marketOrderService.quote({
      player: who.uuid,
      item: COBBLE,
      direction: 'sell',
      quantity: 500,
    });
    await expect(sell(who, 500, Math.ceil(quote.total * 1.5))).rejects.toMatchObject({
      statusCode: 409,
      data: { problem: 'priceChanged', quote: { total: quote.total } },
    });
    expect(await balanceOf(who.account)).toBe(100_000);
    // Within 1 %: the player saw slightly more.
    await expect(sell(who, 500, Math.floor(quote.total * 1.005))).resolves.toMatchObject({
      replayed: false,
    });
  });

  it('pays a lower rate once the 24 hour window passes the first bracket', async () => {
    const who = await player();
    const first = await sell(who, 1000);
    await db.insert(marketSale).values({ userId: who.id, tier: 1, nominal: 100_000 });
    const second = await marketOrderService.quote({
      player: who.uuid,
      item: COBBLE,
      direction: 'sell',
      quantity: 1000,
    });
    expect(second.brackets![0]!.rate).toBeLessThan(1);
    expect(second.total).toBeLessThan(first.total);
    expect((await marketReadService.playerWindow(who.uuid)).tiers[0]!.rate).toBeLessThan(1);
  });

  it('cuts a sale to the 30-day mint budget, and refuses one paying nothing', async () => {
    const who = await player();
    const circ = await circulation(db);
    await db.update(marketSettings).set({ mintCapPercent: 100 }).where(eq(marketSettings.id, 1));
    const { mintRemaining } = await marketReadService.state();
    // A budget of 100 cents above what is already spent.
    const pct = (circ - 0 + 0 > 0 ? (100 + (circ - mintRemaining)) / circ : 1) * 100;
    await db.update(marketSettings).set({ mintCapPercent: pct }).where(eq(marketSettings.id, 1));
    const result = await sell(who, 2000);
    expect(result.capped).toBe(true);
    expect(result.total).toBeLessThanOrEqual(101);
    await db.update(marketSettings).set({ mintCapPercent: 0 }).where(eq(marketSettings.id, 1));
    await expect(sell(who, 2000)).rejects.toMatchObject({
      statusCode: 409,
      data: { problem: 'zeroPayout' },
    });
    await db.update(marketSettings).set({ mintCapPercent: 100 }).where(eq(marketSettings.id, 1));
  });

  it('keeps the stock and the ledger consistent under concurrent orders', async () => {
    const who = await player();
    const results = await Promise.all(Array.from({ length: 6 }, () => sell(who, 300)));
    expect(new Set(results.map((r) => r.transactionId)).size).toBe(6);
    expect(await balanceOf(who.account)).toBe(
      100_000 + results.reduce((sum, r) => sum + r.total, 0),
    );
    const orders = await db
      .select()
      .from(marketOrder)
      .where(eq(marketOrder.userId, who.id))
      .orderBy(marketOrder.id);
    for (let i = 1; i < orders.length; i++) {
      expect(orders[i]!.stockBefore).toBeCloseTo(orders[i - 1]!.stockAfter, 1);
    }
    const unbalanced = await db.execute(
      sql`select transaction_id from economy_entry group by transaction_id having sum(amount) <> 0`,
    );
    expect(unbalanced.rows).toEqual([]);
  });

  it('refuses banned players, disabled items and closed directions', async () => {
    const banned = await player();
    await db.insert(wardenBan).values({ userId: banned.id, reason: 'Cheating', source: 'web' });
    await expect(sell(banned, 10)).rejects.toMatchObject({
      statusCode: 409,
      data: { problem: 'frozen' },
    });
    const who = await player();
    await db.update(marketItem).set({ sellable: false }).where(eq(marketItem.id, COBBLE));
    await expect(sell(who, 10)).rejects.toMatchObject({ data: { problem: 'notSellable' } });
    await db
      .update(marketItem)
      .set({ sellable: true, enabled: false })
      .where(eq(marketItem.id, COBBLE));
    await expect(sell(who, 10)).rejects.toMatchObject({ data: { problem: 'itemDisabled' } });
    await db.update(marketItem).set({ enabled: true }).where(eq(marketItem.id, COBBLE));
    await flagService.set({ key: 'economy.market.sell', enabled: false, actorId: admin });
    await expect(sell(who, 10)).rejects.toMatchObject({
      statusCode: 503,
      data: { problem: 'disabled' },
    });
    await flagService.set({ key: 'economy.market.sell', enabled: true, actorId: admin });
  });

  it('serves the state, the public page and the history', async () => {
    const state = await marketReadService.state();
    expect(state.items.length).toBeGreaterThan(20);
    expect(state.settings.sigma).toBeCloseTo(0.15);
    await marketJobs.snapshot();
    const page = await marketReadService.publicOverview();
    expect(page.items.find((i) => i.id === COBBLE)!.sparkline.length).toBeGreaterThan(1);
    expect((await marketReadService.history(COBBLE, '24h')).points.length).toBeGreaterThan(0);
    expect((await marketReadService.history(COBBLE, '1y')).points.length).toBeGreaterThan(0);
  });

  it('coalesces stock events into one market event', async () => {
    const who = await player();
    await sell(who, 10);
    await sell(who, 10);
    await marketEvents.flush();
    const rows = await db.execute(
      sql`select data from minecraft_server_event where type = 'market' order by id desc limit 1`,
    );
    expect(rows.rows[0]).toBeTruthy();
  });

  it('prunes old history and keeps the recent one', async () => {
    await db.insert(marketSnapshot).values({
      itemId: COBBLE,
      price: 0.05,
      stock: 1,
      at: new Date(Date.now() - 400 * 86_400_000),
    });
    const removed = await marketJobs.prune(365);
    expect(removed.snapshots).toBeGreaterThanOrEqual(1);
  });
});

describe('the Market admin', () => {
  it('refuses a catalog change without recipes, and a loop with them', async () => {
    await db.delete(marketRecipe);
    const sand = { id: 'test:sand', tier: 1 as const, p0: 0.01, s0: 1000, buyable: true };
    await expect(marketAdminService.createItem(admin, sand)).rejects.toMatchObject({
      data: { problem: 'noRecipes' },
    });
    await marketRecipeService.replace({
      recipes: [
        {
          type: 'test:craft',
          output: { id: 'test:wall', count: 1 },
          inputs: [{ id: 'test:stone', count: 4 }],
        },
      ],
    });
    await marketAdminService.createItem(admin, sand);
    await marketRecipeService.replace({
      recipes: [
        {
          type: 'test:smelt',
          output: { id: 'test:glass', count: 1 },
          inputs: [{ id: 'test:sand', count: 1 }],
        },
      ],
    });
    await expect(
      marketAdminService.createItem(admin, { id: 'test:glass', tier: 1, p0: 1, s0: 1000 }),
    ).rejects.toMatchObject({
      statusCode: 409,
      data: { problem: 'loop' },
    });
    expect((await marketAdminService.validate({ items: [] })).ok).toBe(true);
  });

  it('keeps the price on a curve change unless asked, and writes a version', async () => {
    const before = await marketReadService.publicOverview();
    const price = before.items.find((i) => i.id === 'test:sand')?.price ?? 0;
    const row = await stockOf('test:sand');
    const kept = await marketAdminService.updateItem(admin, 'test:sand', {
      k: 1.1,
      keepPrice: true,
    });
    expect(kept.price).toBeCloseTo(price || row.p0 * (row.s0 / row.stock) ** row.k, 4);
    const versions = await db
      .select()
      .from(marketItemVersion)
      .where(eq(marketItemVersion.itemId, 'test:sand'));
    expect(versions.length).toBe(2);
    const reset = await marketAdminService.resetStock(admin, 'test:sand', 'test');
    expect(reset.stock).toBeCloseTo(1000, 3);
  });

  it('lists the recipes that use an item, and says how fresh the list and the day are', async () => {
    const using = await marketRecipeService.list(undefined, 'test:sand');
    expect(using.items.map((recipe) => recipe.output.id)).toEqual(['test:glass']);
    const stats = await marketAdminService.stats('7d');
    expect(stats.recipes.total).toBe(1);
    expect(stats.recipes.updatedAt).toEqual(expect.any(String));
    expect(stats.today.orders).toBeGreaterThanOrEqual(1);
    expect(stats.today.capped).toBeGreaterThanOrEqual(0);
  });
});
