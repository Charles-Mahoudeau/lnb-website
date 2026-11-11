import { eq } from 'drizzle-orm';

import { db } from '~~/server/db';
import { isUniqueViolation } from '~~/server/db/errors';
import type { economyAccount } from '~~/server/db/schema';
import { economyShop, economyShopOrder } from '~~/server/db/schema';

import { economyAccountService } from './accounts';
import { economyLedger } from './ledger';
import { canSpend } from './rules';
import { hashRequest, player, previousByKey } from './server';
import { bannedUsers, refuse } from './shared';
import type { Db, Tx } from './shared';

import type {
  EconomyServerShop,
  EconomyShopOrderBody,
  EconomyShopOrderResult,
  EconomyShopSettings,
} from '#shared/schemas/economy';
import {
  ECONOMY_MAX_AMOUNT,
  economyShopOrderBody,
  economyShopSettings,
} from '#shared/schemas/economy';

// Player shops: a block in the game that sells one item for an account and may buy it back.
// The server registers and updates them; orders are priced here, from the saved prices, so the
// server never sends an amount. See docs/economy.md.

type Shop = typeof economyShop.$inferSelect;
type Account = typeof economyAccount.$inferSelect;

function view(shop: Shop, account: Pick<Account, 'id' | 'kind' | 'handle'>): EconomyServerShop {
  return {
    id: shop.id,
    account: { id: account.id, kind: account.kind, handle: account.handle },
    item: { id: shop.itemId, name: shop.itemName },
    lotSize: shop.lotSize,
    sellPrice: shop.sellPrice,
    buyPrice: shop.buyPrice,
    position: { world: shop.world, x: shop.x, y: shop.y, z: shop.z },
    disabled: Boolean(shop.disabledAt),
    disabledReason: shop.disabledReason,
  };
}

async function shopById(dbx: Db, shopId: string, lock = false): Promise<Shop> {
  const query = dbx.select().from(economyShop).where(eq(economyShop.id, shopId));
  const [shop] = lock ? await query.for('update') : await query;
  if (!shop) refuse(404, 'notFound');
  return shop;
}

/** The account a player saves a shop for: they must be able to spend from it. */
async function accountToRun(tx: Tx, uuid: string, ref: string): Promise<Account> {
  const { userId } = await player(tx, uuid);
  if ((await bannedUsers(tx, [userId])).size) refuse(409, 'frozen');
  const account = await economyAccountService.byRef(tx, ref);
  if (account.closedAt) refuse(409, 'closed');
  if (!canSpend(await economyAccountService.roleIn(tx, account, userId))) {
    refuse(403, 'notAllowed');
  }
  return account;
}

function settingsColumns(body: ReturnType<typeof economyShopSettings.parse>, accountId: string) {
  return {
    accountId,
    itemId: body.item.id,
    itemSnbt: body.item.snbt,
    itemName: body.item.name,
    lotSize: body.lotSize,
    sellPrice: body.sellPrice,
    buyPrice: body.buyPrice ?? null,
    world: body.position.world,
    x: body.position.x,
    y: body.position.y,
    z: body.position.z,
  };
}

/** Registers a shop the first time its owner saves it in the game. */
async function create(input: EconomyShopSettings): Promise<EconomyServerShop> {
  const body = economyShopSettings.parse(input);
  return db.transaction(async (tx) => {
    const account = await accountToRun(tx, body.player, body.account);
    const { userId } = await player(tx, body.player);
    const [shop] = await tx
      .insert(economyShop)
      .values({ ...settingsColumns(body, account.id), createdByUserId: userId })
      .returning();
    if (!shop) throw new Error('The shop was not written.');
    return view(shop, account);
  });
}

/**
 * Saves a shop's settings again: its item, prices, account and place. The player must be able
 * to spend from the shop's account and from the new one. A shop an admin turned off stays off;
 * one whose block was broken comes back, since its owner placed it again.
 */
async function update(shopId: string, input: EconomyShopSettings): Promise<EconomyServerShop> {
  const body = economyShopSettings.parse(input);
  return db.transaction(async (tx) => {
    const shop = await shopById(tx, shopId, true);
    if (shop.disabledReason === 'admin') refuse(409, 'shopDisabled');
    await accountToRun(tx, body.player, shop.accountId);
    const account = await accountToRun(tx, body.player, body.account);
    const [saved] = await tx
      .update(economyShop)
      .set({
        ...settingsColumns(body, account.id),
        disabledAt: null,
        disabledReason: null,
        disabledByUserId: null,
        updatedAt: new Date(),
      })
      .where(eq(economyShop.id, shopId))
      .returning();
    if (!saved) throw new Error('The shop was not saved.');
    return view(saved, account);
  });
}

/** The shop as the site has it, for the game to check before showing it. */
async function get(shopId: string): Promise<EconomyServerShop> {
  const shop = await shopById(db, shopId);
  return view(shop, await economyAccountService.byRef(db, shop.accountId));
}

/** Turns a shop off when its block is broken. Calling it again changes nothing. */
async function remove(shopId: string): Promise<EconomyServerShop> {
  return db.transaction(async (tx) => {
    const shop = await shopById(tx, shopId, true);
    const saved = shop.disabledAt
      ? shop
      : await tx
          .update(economyShop)
          .set({ disabledAt: new Date(), disabledReason: 'removed', updatedAt: new Date() })
          .where(eq(economyShop.id, shopId))
          .returning()
          .then(([row]) => row ?? shop);
    return view(saved, await economyAccountService.byRef(tx, shop.accountId));
  });
}

function orderPrint(shopId: string, body: ReturnType<typeof economyShopOrderBody.parse>) {
  return hashRequest({
    shop: shopId,
    player: body.player,
    account: body.account ?? null,
    direction: body.direction,
    lots: body.lots,
    expectedLotPrice: body.expectedLotPrice,
  });
}

async function previousOrder(
  shopId: string,
  key: string,
  print: string,
): Promise<EconomyShopOrderResult | undefined> {
  const previous = await previousByKey(db, key, print);
  if (!previous) return undefined;
  const [order] = await db
    .select()
    .from(economyShopOrder)
    .where(eq(economyShopOrder.transactionId, previous.transactionId));
  if (order?.shopId !== shopId) refuse(409, 'idempotencyMismatch');
  return {
    ...previous,
    shopId,
    direction: order.direction,
    lots: order.lots,
    lotPrice: order.lotPrice,
  };
}

/**
 * Buys lots from a shop, or sells them back to it, at the saved price. The game holds the items
 * aside until this answers. A shop pays for what it buys back from its own account, with no
 * owner around: only at its saved buy price, and only while it is on.
 */
async function order(shopId: string, input: EconomyShopOrderBody): Promise<EconomyShopOrderResult> {
  const body = economyShopOrderBody.parse(input);
  const print = orderPrint(shopId, body);
  const previous = await previousOrder(shopId, body.idempotencyKey, print);
  if (previous) return previous;

  try {
    return await db.transaction(async (tx) => {
      const shop = await shopById(tx, shopId);
      if (shop.disabledAt) refuse(409, 'shopDisabled');
      const lotPrice = body.direction === 'buy' ? shop.sellPrice : shop.buyPrice;
      if (lotPrice === null) refuse(409, 'noBuyBack');
      if (lotPrice !== body.expectedLotPrice) refuse(409, 'priceChanged');
      const amount = lotPrice * body.lots;
      // No balance can hold more than the largest amount.
      if (amount > ECONOMY_MAX_AMOUNT) refuse(409, 'insufficientFunds');

      const customer = await player(tx, body.player);
      if ((await bannedUsers(tx, [customer.userId])).size) refuse(409, 'frozen');
      const shopAccount = await economyAccountService.byRef(tx, shop.accountId);

      let customerAccount: Account;
      if (body.account) {
        customerAccount = await economyAccountService.byRef(tx, body.account);
        if (!canSpend(await economyAccountService.roleIn(tx, customerAccount, customer.userId))) {
          refuse(403, 'notAllowed');
        }
      } else if (body.direction === 'buy') {
        const id = await economyAccountService.resolveDefault(
          tx,
          customer.userId,
          customer.personal.id,
        );
        customerAccount = await economyAccountService.byRef(tx, id);
      } else {
        customerAccount = customer.personal;
      }
      if (customerAccount.id === shopAccount.id) refuse(409, 'sameAccount');

      const [from, to] =
        body.direction === 'buy' ? [customerAccount, shopAccount] : [shopAccount, customerAccount];
      const posted = await economyLedger.post(tx, {
        kind: 'shop',
        memo: `${String(body.lots * shop.lotSize)} × ${shop.itemName}`,
        actor: { source: 'minecraft', userId: customer.userId, minecraftUuid: body.player },
        idempotencyKey: body.idempotencyKey,
        fingerprint: print,
        legs: [
          { accountId: from.id, amount: -amount },
          { accountId: to.id, amount },
        ],
      });
      await tx.insert(economyShopOrder).values({
        transactionId: posted.transactionId,
        shopId,
        direction: body.direction,
        lots: body.lots,
        lotPrice,
      });
      return {
        transactionId: posted.transactionId,
        replayed: false,
        amount,
        from: {
          accountId: from.id,
          handle: from.handle,
          balance: posted.balances.get(from.id) ?? 0,
        },
        to: { accountId: to.id, handle: to.handle, balance: posted.balances.get(to.id) ?? 0 },
        shopId,
        direction: body.direction,
        lots: body.lots,
        lotPrice,
      };
    });
  } catch (error) {
    // The same key sent twice at once: the second one lost the race, so answer like a retry.
    if (isUniqueViolation(error)) {
      const raced = await previousOrder(shopId, body.idempotencyKey, print);
      if (raced) return raced;
    }
    throw error;
  }
}

export const economyShopService = { create, update, get, remove, order };
