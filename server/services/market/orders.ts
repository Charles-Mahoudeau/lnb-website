import { eq, sql } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import { isUniqueViolation } from '~~/server/db/errors';
import {
  economyMailboxItem,
  economyTransaction,
  marketItem,
  marketOrder,
  marketSale,
} from '~~/server/db/schema';
import { economyAccountService } from '~~/server/services/economy/accounts';
import { economyLedger } from '~~/server/services/economy/ledger';
import { canSpend } from '~~/server/services/economy/rules';
import { hashRequest, ownerOf, player } from '~~/server/services/economy/server';
import { bannedUsers, refuse } from '~~/server/services/economy/shared';
import type { Db, Tx } from '~~/server/services/economy/shared';
import { flagService } from '~~/server/services/flags';

import { marketEvents } from './events';
import {
  bracketsOf,
  curveOf,
  loadConfig,
  mintRemaining,
  problem,
  stockNow,
  windowsOf,
} from './shared';
import type { MarketConfig, MarketItemRow } from './shared';

import type { FlagKey } from '#shared/flags';
import { marketOrderBody, marketQuoteBody } from '#shared/schemas/market';
import type {
  MarketOrderBody,
  MarketOrderResult,
  MarketQuote,
  MarketQuoteBody,
} from '#shared/schemas/market';
import {
  marketItemName,
  marketPRef,
  marketQuotePurchase,
  marketQuoteSale,
} from '#shared/utils/market';

// Orders and quotes: the site prices every sale and purchase from the item's stock, the player's
// window and the mint budget, in one database transaction, and the Minecraft server only relays
// what the player asked for. See docs/market.md.

const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

/** A 503 `disabled` when the Market, or the direction of this order, is switched off. */
export async function requireMarketFlags(direction?: 'sell' | 'buy'): Promise<void> {
  const keys: FlagKey[] = ['economy.market'];
  if (direction) keys.push(direction === 'sell' ? 'economy.market.sell' : 'economy.market.buy');
  for (const key of keys) {
    if (!(await flagService.isEnabled(key))) {
      throw createError({
        status: 503,
        statusText: 'disabled',
        data: { problem: 'disabled', flag: key },
      });
    }
  }
}

interface Priced {
  quote: MarketQuote;
  /** Nominal value a sale adds to the player's window, in LNBits. */
  nominal: number;
  stockAfter: number;
}

/** The pure part of an order: the quote for these inputs, mint cap included. */
function priceOrder(input: {
  row: MarketItemRow;
  config: MarketConfig;
  direction: 'sell' | 'buy';
  quantity: number;
  now: Date;
  /** The player's window in the item's tier, LNBits. */
  window: number;
  /** Cents the Market may still mint. */
  remaining: number;
}): Priced {
  const { row, config, direction, quantity } = input;
  const curve = curveOf(row);
  const stock = stockNow(row, input.now);
  if (direction === 'buy') {
    const bought = marketQuotePurchase(curve, config.sigma, stock, quantity);
    const stockAfter = round6(bought.stock);
    return {
      nominal: 0,
      stockAfter,
      quote: {
        direction,
        item: row.id,
        quantity,
        total: bought.total,
        capped: false,
        price: marketPRef(curve, stockAfter),
        stock: stockAfter,
      },
    };
  }
  const sale = marketQuoteSale(
    curve,
    config.sigma,
    bracketsOf(config, row.tier),
    stock,
    input.window,
    quantity,
  );
  const capped = sale.total > input.remaining;
  const stockAfter = round6(sale.stock);
  return {
    nominal: sale.nominal,
    stockAfter,
    quote: {
      direction,
      item: row.id,
      quantity,
      total: capped ? Math.max(0, input.remaining) : sale.total,
      capped,
      brackets: sale.brackets,
      price: marketPRef(curve, stockAfter),
      stock: stockAfter,
    },
  };
}

/** What every order needs of the item, before pricing it. */
function checkTradable(
  row: MarketItemRow | undefined,
  direction: 'sell' | 'buy',
  config: MarketConfig,
  quantity: number,
): asserts row is MarketItemRow {
  if (!row) problem(404, 'notFound');
  if (!row.enabled) problem(409, 'itemDisabled');
  if (direction === 'sell' ? !row.sellable : !row.buyable) {
    problem(409, direction === 'sell' ? 'notSellable' : 'notBuyable');
  }
  if (quantity > config.maxOrderItems) problem(400, 'tooManyItems');
}

async function itemById(dbx: Db, id: string, lock = false) {
  const query = dbx.select().from(marketItem).where(eq(marketItem.id, id));
  return (lock ? await query.for('update') : await query)[0];
}

/** The site's own quote for a player and an item, changing nothing. */
async function quote(input: MarketQuoteBody): Promise<MarketQuote> {
  const body = marketQuoteBody.parse(input);
  await requireMarketFlags(body.direction);
  const userId = await ownerOf(db, body.player);
  if (!(await economyAccountService.isEligible(db, userId))) refuse(403, 'notEligible');
  const config = await loadConfig(db);
  const row = await itemById(db, body.item);
  checkTradable(row, body.direction, config, body.quantity);
  const now = new Date();
  const sell = body.direction === 'sell';
  return priceOrder({
    row,
    config,
    direction: body.direction,
    quantity: body.quantity,
    now,
    window: sell ? ((await windowsOf(db, userId, now)).get(row.tier) ?? 0) : 0,
    remaining: sell ? (await mintRemaining(db, config, now)).remaining : Infinity,
  }).quote;
}

/** An order already made with this key, or nothing. The same key on another request is refused. */
async function previousOrder(
  dbx: Db,
  key: string,
  print: string,
): Promise<MarketOrderResult | undefined> {
  const [existing] = await dbx
    .select({ fingerprint: marketOrder.fingerprint, result: marketOrder.result })
    .from(marketOrder)
    .where(eq(marketOrder.idempotencyKey, key));
  if (existing) {
    if (existing.fingerprint !== print) problem(409, 'idempotencyMismatch');
    return { ...(existing.result as unknown as MarketOrderResult), replayed: true };
  }
  const [other] = await dbx
    .select({ id: economyTransaction.id })
    .from(economyTransaction)
    .where(eq(economyTransaction.idempotencyKey, key));
  if (other) problem(409, 'idempotencyMismatch');
  return undefined;
}

/** The account a purchase is paid from: the one named, or the player's default. */
async function payingAccount(
  tx: Tx,
  body: { account?: string },
  customer: Awaited<ReturnType<typeof player>>,
) {
  const account = body.account
    ? await economyAccountService.byRef(tx, body.account)
    : await economyAccountService
        .resolveDefault(tx, customer.userId, customer.personal.id)
        .then((id) => economyAccountService.byRef(tx, id));
  if (!canSpend(await economyAccountService.roleIn(tx, account, customer.userId))) {
    refuse(403, 'notAllowed');
  }
  return account;
}

/**
 * Sells or buys items. The item row is locked and its stock drifted to now; the player's window
 * and the mint budget are read under locks; the ledger transaction, the order, the mailbox item of
 * a purchase and the stock are written together. A retry with the same key gives back the first
 * answer, even with the Market switched off. Events go out after the commit.
 */
async function order(input: MarketOrderBody): Promise<MarketOrderResult> {
  const body = marketOrderBody.parse(input);
  const print = hashRequest({
    player: body.player,
    account: body.account ?? null,
    item: body.item,
    direction: body.direction,
    quantity: body.quantity,
    expectedTotal: body.expectedTotal,
  });
  const previous = await previousOrder(db, body.idempotencyKey, print);
  if (previous) return previous;
  // After the key lookup: a retry settles an order that exists even when a flag was switched off.
  await requireMarketFlags(body.direction);

  try {
    const done = await db.transaction(async (tx) => {
      const config = await loadConfig(tx);
      const row = await itemById(tx, body.item, true);
      // Locked now: a retry that raced the first call finds its answer.
      const replay = await previousOrder(tx, body.idempotencyKey, print);
      if (replay) return { result: replay, moved: false as const };
      checkTradable(row, body.direction, config, body.quantity);

      const customer = await player(tx, body.player);
      if ((await bannedUsers(tx, [customer.userId])).size) refuse(409, 'frozen');
      const sell = body.direction === 'sell';
      const account = sell ? customer.personal : await payingAccount(tx, body, customer);

      const now = new Date();
      let window = 0;
      let remaining = Infinity;
      if (sell) {
        // Every sale spends the same budget, and a player's sales share one window: both read
        // under a lock that is held to the commit, so two orders can't both see the same room.
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended('market:mint-cap', 0))`);
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtextextended(${`market:window:${customer.userId}`}, 0))`,
        );
        window = (await windowsOf(tx, customer.userId, now)).get(row.tier) ?? 0;
        remaining = (await mintRemaining(tx, config, now)).remaining;
      }
      const priced = priceOrder({
        row,
        config,
        direction: body.direction,
        quantity: body.quantity,
        now,
        window,
        remaining,
      });
      const { total } = priced.quote;
      if (sell && total <= 0) problem(409, 'zeroPayout');
      const tolerance = config.tolerancePercent / 100;
      const worse = sell
        ? total < body.expectedTotal * (1 - tolerance)
        : total > body.expectedTotal * (1 + tolerance);
      if (worse) problem(409, 'priceChanged', { quote: priced.quote });

      const memo = `${String(body.quantity)} × ${marketItemName(row.id)}`;
      const posted = await economyLedger.post(tx, {
        kind: 'market',
        reason: sell ? 'marketSale' : 'marketPurchase',
        memo,
        actor: { source: 'minecraft', userId: customer.userId, minecraftUuid: body.player },
        idempotencyKey: body.idempotencyKey,
        fingerprint: print,
        legs: sell
          ? [
              { accountId: null, amount: -total },
              { accountId: account.id, amount: total },
            ]
          : [
              { accountId: account.id, amount: -total },
              { accountId: null, amount: total },
            ],
      });

      let mailboxItemId: string | undefined;
      if (sell) {
        await tx
          .insert(marketSale)
          .values({ userId: customer.userId, tier: row.tier, nominal: round6(priced.nominal) });
      } else {
        const [item] = await tx
          .insert(economyMailboxItem)
          .values({
            userId: customer.userId,
            reason: 'market',
            itemId: row.id,
            itemSnbt: '',
            itemName: marketItemName(row.id),
            count: body.quantity,
          })
          .returning({ id: economyMailboxItem.id });
        mailboxItemId = item?.id;
      }
      await tx
        .update(marketItem)
        .set({ stock: priced.stockAfter, stockAt: now })
        .where(eq(marketItem.id, row.id));

      const result: MarketOrderResult = {
        ...priced.quote,
        transactionId: posted.transactionId,
        replayed: false,
        account: {
          accountId: account.id,
          handle: account.handle,
          balance: posted.balances.get(account.id) ?? 0,
        },
        ...(mailboxItemId ? { mailboxItemId } : {}),
      };
      const { replayed: _replayed, ...stored } = result;
      await tx.insert(marketOrder).values({
        idempotencyKey: body.idempotencyKey,
        fingerprint: print,
        userId: customer.userId,
        minecraftUuid: body.player,
        accountId: account.id,
        itemId: row.id,
        direction: body.direction,
        quantity: body.quantity,
        total,
        capped: priced.quote.capped,
        transactionId: posted.transactionId,
        stockBefore: round6(stockNow(row, now)),
        stockAfter: priced.stockAfter,
        result: stored,
      });
      return { result, moved: true as const, at: now, stock: priced.stockAfter };
    });
    if (done.moved) marketEvents.stockChanged(body.item, done.stock, done.at);
    return done.result;
  } catch (error) {
    // The same key sent twice at once: the second one lost the race, so answer like a retry.
    if (isUniqueViolation(error)) {
      const raced = await previousOrder(db, body.idempotencyKey, print);
      if (raced) return raced;
    }
    throw error;
  }
}

export const marketOrderService = { quote, order, priceOrder };
