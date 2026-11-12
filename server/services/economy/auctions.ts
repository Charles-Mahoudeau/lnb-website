import { and, asc, count, desc, eq, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import { isUniqueViolation } from '~~/server/db/errors';
import {
  economyAccount,
  economyEntry,
  economyListing,
  economyMailboxItem,
  economyTransaction,
  minecraftAccount,
} from '~~/server/db/schema';

import { economyAccountService } from './accounts';
import { economyLedger } from './ledger';
import { auctionTax, canSpend } from './rules';
import { hashRequest, ownerOf, player } from './server';
import { economySettingsService } from './settings';
import { bannedUsers, refuse } from './shared';
import type { Db, Tx } from './shared';

import type {
  EconomyListingBody,
  EconomyListingBuyBody,
  EconomyListingBuyResult,
  EconomyListingPage,
  EconomyListingsQuery,
  EconomyMailboxClaimResult,
  EconomyMailboxView,
  EconomyPlayerListings,
  EconomySalesSeenBody,
  EconomyServerListing,
  EconomyServerSales,
} from '#shared/schemas/economy';
import {
  ECONOMY_LISTINGS_PAGE,
  ECONOMY_SALES_PAGE,
  economyListingActionBody,
  economyListingBody,
  economyListingBuyBody,
  economyListingsQuery,
} from '#shared/schemas/economy';

// The auction house: players list one stack at a fixed price from the game; the item leaves the
// game and is kept here until it sells, its seller takes it back, or it expires. Items waiting for
// a player (bought, or unsold) sit in their mailbox until the server claims them. See
// docs/economy.md.

type Listing = typeof economyListing.$inferSelect;
type MailboxItem = typeof economyMailboxItem.$inferSelect;

const DAY_MS = 24 * 60 * 60 * 1000;

function listingView(listing: Listing, seller: string | null): EconomyServerListing {
  return {
    id: listing.id,
    item: { id: listing.itemId, name: listing.itemName, snbt: listing.itemSnbt },
    count: listing.count,
    price: listing.price,
    seller: seller ?? '',
    status: listing.status,
    createdAt: listing.createdAt.toISOString(),
    expiresAt: listing.expiresAt.toISOString(),
  };
}

function mailboxView(item: MailboxItem): EconomyMailboxView {
  return {
    id: item.id,
    item: { id: item.itemId, name: item.itemName, snbt: item.itemSnbt },
    count: item.count,
    reason: item.reason,
    createdAt: item.createdAt.toISOString(),
  };
}

function toMailbox(listing: Listing, userId: string, reason: MailboxItem['reason']) {
  return {
    userId,
    listingId: listing.id,
    reason,
    itemId: listing.itemId,
    itemSnbt: listing.itemSnbt,
    itemName: listing.itemName,
    count: listing.count,
  };
}

/**
 * Ends the listings whose time is up and sends their items back to their sellers' mailboxes. Run
 * before anything reads listings or a mailbox, and every night, so no expired listing sells.
 */
async function expireDue(dbx: Db): Promise<number> {
  return dbx.transaction(async (tx) => {
    const now = new Date();
    const expired = await tx
      .update(economyListing)
      .set({ status: 'expired', endedAt: now })
      .where(and(eq(economyListing.status, 'active'), lt(economyListing.expiresAt, now)))
      .returning();
    if (expired.length) {
      await tx
        .insert(economyMailboxItem)
        .values(expired.map((listing) => toMailbox(listing, listing.sellerUserId, 'expired')));
    }
    return expired.length;
  });
}

async function sellerName(dbx: Db, listing: Listing): Promise<string | null> {
  const [row] = await dbx
    .select({ username: minecraftAccount.username })
    .from(minecraftAccount)
    .where(eq(minecraftAccount.uuid, listing.sellerMinecraftUuid));
  return row?.username ?? null;
}

/** The account a player chose, which they must spend from, or their default one. */
async function chosenAccount(
  tx: Tx,
  who: { userId: string; personal: { id: string } },
  ref?: string,
) {
  if (!ref) {
    const id = await economyAccountService.resolveDefault(tx, who.userId, who.personal.id);
    return economyAccountService.byRef(tx, id);
  }
  const account = await economyAccountService.byRef(tx, ref);
  if (!canSpend(await economyAccountService.roleIn(tx, account, who.userId))) {
    refuse(403, 'notAllowed');
  }
  return account;
}

async function byKey(key: string): Promise<EconomyServerListing | undefined> {
  const [existing] = await db
    .select()
    .from(economyListing)
    .where(eq(economyListing.idempotencyKey, key));
  return existing ? listingView(existing, await sellerName(db, existing)) : undefined;
}

/** Lists one stack. The item already left the game: a retry with the same key lists it once. */
async function create(input: EconomyListingBody): Promise<EconomyServerListing> {
  const body = economyListingBody.parse(input);
  const previous = await byKey(body.idempotencyKey);
  if (previous) return previous;
  await expireDue(db);

  try {
    const listing = await db.transaction(async (tx) => {
      const seller = await player(tx, body.player);
      if ((await bannedUsers(tx, [seller.userId])).size) refuse(409, 'frozen');
      const account = await chosenAccount(tx, seller, body.account);
      if (account.closedAt) refuse(409, 'closed');
      const settings = await economySettingsService.get(tx);
      const [up] = await tx
        .select({ n: count() })
        .from(economyListing)
        .where(
          and(eq(economyListing.sellerUserId, seller.userId), eq(economyListing.status, 'active')),
        );
      if ((up?.n ?? 0) >= settings.auctionMaxListings) refuse(409, 'tooManyListings');
      const [created] = await tx
        .insert(economyListing)
        .values({
          sellerUserId: seller.userId,
          sellerMinecraftUuid: body.player,
          accountId: account.id,
          itemId: body.item.id,
          itemSnbt: body.item.snbt,
          itemName: body.item.name,
          count: body.count,
          price: body.price,
          idempotencyKey: body.idempotencyKey,
          expiresAt: new Date(Date.now() + settings.auctionDays * DAY_MS),
        })
        .returning();
      if (!created) throw new Error('The listing was not written.');
      return created;
    });
    return listingView(listing, await sellerName(db, listing));
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await byKey(body.idempotencyKey);
      if (raced) return raced;
    }
    throw error;
  }
}

/** The listings up now, 45 per page. The cursor is how many came before. */
async function list(input: EconomyListingsQuery): Promise<EconomyListingPage> {
  const query = economyListingsQuery.parse(input);
  await expireDue(db);
  const offset = query.cursor ? Number(query.cursor) : 0;
  if (!Number.isSafeInteger(offset) || offset < 0) refuse(400, 'invalidCursor');
  const search = query.q ? `%${query.q.replace(/[\\%_]/g, '\\$&')}%` : undefined;
  const order = {
    newest: [desc(economyListing.createdAt), desc(economyListing.id)],
    price: [asc(economyListing.price), desc(economyListing.createdAt)],
    unitPrice: [
      asc(sql`${economyListing.price}::float / ${economyListing.count}`),
      desc(economyListing.createdAt),
    ],
  }[query.sort];
  const rows = await db
    .select({ listing: economyListing, seller: minecraftAccount.username })
    .from(economyListing)
    .leftJoin(minecraftAccount, eq(minecraftAccount.uuid, economyListing.sellerMinecraftUuid))
    .where(
      and(
        eq(economyListing.status, 'active'),
        search
          ? or(ilike(economyListing.itemName, search), ilike(economyListing.itemId, search))
          : undefined,
      ),
    )
    .orderBy(...order)
    .limit(ECONOMY_LISTINGS_PAGE + 1)
    .offset(offset);
  return {
    items: rows.slice(0, ECONOMY_LISTINGS_PAGE).map((row) => listingView(row.listing, row.seller)),
    nextCursor: rows.length > ECONOMY_LISTINGS_PAGE ? String(offset + ECONOMY_LISTINGS_PAGE) : null,
  };
}

/** A player's listings up now, with the limits that apply to new ones. */
async function mine(uuid: string): Promise<EconomyPlayerListings> {
  const userId = await ownerOf(db, uuid);
  await expireDue(db);
  const [rows, settings] = await Promise.all([
    db
      .select({ listing: economyListing, seller: minecraftAccount.username })
      .from(economyListing)
      .leftJoin(minecraftAccount, eq(minecraftAccount.uuid, economyListing.sellerMinecraftUuid))
      .where(and(eq(economyListing.sellerUserId, userId), eq(economyListing.status, 'active')))
      .orderBy(desc(economyListing.createdAt)),
    economySettingsService.get(),
  ]);
  return {
    items: rows.map((row) => listingView(row.listing, row.seller)),
    max: settings.auctionMaxListings,
    taxPercent: settings.auctionTaxPercent,
    days: settings.auctionDays,
  };
}

/** The seller takes a listing back: its item goes to their mailbox. Calling it again changes nothing. */
async function cancel(listingId: string, input: unknown): Promise<EconomyServerListing> {
  const body = economyListingActionBody.parse(input);
  await expireDue(db);
  const listing = await db.transaction(async (tx) => {
    const userId = await ownerOf(tx, body.player);
    const [found] = await tx
      .select()
      .from(economyListing)
      .where(eq(economyListing.id, listingId))
      .for('update');
    if (!found) refuse(404, 'notFound');
    if (found.sellerUserId !== userId) refuse(403, 'notAllowed');
    if (found.status === 'cancelled') return found;
    if (found.status !== 'active') refuse(409, 'listingGone');
    const [ended] = await tx
      .update(economyListing)
      .set({ status: 'cancelled', endedAt: new Date() })
      .where(eq(economyListing.id, listingId))
      .returning();
    await tx.insert(economyMailboxItem).values(toMailbox(found, userId, 'cancelled'));
    return ended ?? found;
  });
  return listingView(listing, await sellerName(db, listing));
}

function buyPrint(listingId: string, body: ReturnType<typeof economyListingBuyBody.parse>) {
  return hashRequest({
    kind: 'auction',
    listing: listingId,
    player: body.player,
    account: body.account ?? null,
  });
}

/** The result of a purchase already made with this key, or nothing. */
async function previousPurchase(
  listingId: string,
  key: string,
  print: string,
): Promise<EconomyListingBuyResult | undefined> {
  const [transaction] = await db
    .select({ id: economyTransaction.id, fingerprint: economyTransaction.fingerprint })
    .from(economyTransaction)
    .where(eq(economyTransaction.idempotencyKey, key));
  if (!transaction) return undefined;
  if (transaction.fingerprint !== print) refuse(409, 'idempotencyMismatch');
  const [listing] = await db
    .select()
    .from(economyListing)
    .where(eq(economyListing.transactionId, transaction.id));
  if (listing?.id !== listingId) refuse(409, 'idempotencyMismatch');
  const [item] = await db
    .select()
    .from(economyMailboxItem)
    .where(
      and(eq(economyMailboxItem.listingId, listingId), eq(economyMailboxItem.reason, 'bought')),
    );
  const entries = await db
    .select({
      accountId: economyEntry.accountId,
      amount: economyEntry.amount,
      balanceAfter: economyEntry.balanceAfter,
      handle: economyAccount.handle,
    })
    .from(economyEntry)
    .leftJoin(economyAccount, eq(economyAccount.id, economyEntry.accountId))
    .where(eq(economyEntry.transactionId, transaction.id));
  const buyer = entries.find((entry) => entry.accountId && entry.amount < 0);
  const seller = entries.find((entry) => entry.accountId && entry.amount > 0);
  const burned = entries.find((entry) => !entry.accountId)?.amount ?? 0;
  if (!buyer?.accountId || !seller?.accountId || !item) throw new Error('A purchase is whole.');
  return {
    transactionId: transaction.id,
    replayed: true,
    amount: -buyer.amount,
    tax: burned,
    from: { accountId: buyer.accountId, handle: buyer.handle, balance: buyer.balanceAfter ?? 0 },
    to: { accountId: seller.accountId, handle: seller.handle, balance: seller.balanceAfter ?? 0 },
    listingId,
    sellerUserId: listing.sellerUserId,
    mailboxItem: mailboxView(item),
  };
}

/**
 * Buys a listing, in one transaction: the buyer pays the price, the seller's account gets it minus
 * the tax, which is burned, and the item goes to the buyer's mailbox for the server to claim.
 */
async function buy(
  listingId: string,
  input: EconomyListingBuyBody,
): Promise<EconomyListingBuyResult> {
  const body = economyListingBuyBody.parse(input);
  const print = buyPrint(listingId, body);
  const previous = await previousPurchase(listingId, body.idempotencyKey, print);
  if (previous) return previous;
  await expireDue(db);

  try {
    return await db.transaction(async (tx) => {
      const [listing] = await tx
        .select()
        .from(economyListing)
        .where(eq(economyListing.id, listingId))
        .for('update');
      if (!listing) refuse(404, 'notFound');
      if (listing.status !== 'active') refuse(409, 'listingGone');
      const buyer = await player(tx, body.player);
      if (buyer.userId === listing.sellerUserId) refuse(409, 'sameAccount');
      if ((await bannedUsers(tx, [buyer.userId])).size) refuse(409, 'frozen');
      const from = await chosenAccount(tx, buyer, body.account);
      const to = await economyAccountService.byRef(tx, listing.accountId);
      if (from.id === to.id) refuse(409, 'sameAccount');
      const tax = auctionTax(
        listing.price,
        (await economySettingsService.get(tx)).auctionTaxPercent,
      );
      const posted = await economyLedger.post(tx, {
        kind: 'auction',
        reason: tax > 0 ? 'auctionTax' : undefined,
        memo: `${String(listing.count)} × ${listing.itemName}`,
        actor: { source: 'minecraft', userId: buyer.userId, minecraftUuid: body.player },
        idempotencyKey: body.idempotencyKey,
        fingerprint: print,
        legs: [
          { accountId: from.id, amount: -listing.price },
          { accountId: to.id, amount: listing.price - tax },
          ...(tax > 0 ? [{ accountId: null, amount: tax }] : []),
        ],
      });
      await tx
        .update(economyListing)
        .set({
          status: 'sold',
          endedAt: new Date(),
          buyerUserId: buyer.userId,
          transactionId: posted.transactionId,
        })
        .where(eq(economyListing.id, listingId));
      const [item] = await tx
        .insert(economyMailboxItem)
        .values(toMailbox(listing, buyer.userId, 'bought'))
        .returning();
      if (!item) throw new Error('The item was not written.');
      return {
        transactionId: posted.transactionId,
        replayed: false,
        amount: listing.price,
        tax,
        from: {
          accountId: from.id,
          handle: from.handle,
          balance: posted.balances.get(from.id) ?? 0,
        },
        to: { accountId: to.id, handle: to.handle, balance: posted.balances.get(to.id) ?? 0 },
        listingId,
        sellerUserId: listing.sellerUserId,
        mailboxItem: mailboxView(item),
      };
    });
  } catch (error) {
    if (isUniqueViolation(error)) {
      const raced = await previousPurchase(listingId, body.idempotencyKey, print);
      if (raced) return raced;
    }
    throw error;
  }
}

/** The items waiting for a player, oldest first. */
async function mailbox(uuid: string): Promise<{ items: EconomyMailboxView[] }> {
  const userId = await ownerOf(db, uuid);
  await expireDue(db);
  const items = await db
    .select()
    .from(economyMailboxItem)
    .where(and(eq(economyMailboxItem.userId, userId), isNull(economyMailboxItem.claimedAt)))
    .orderBy(asc(economyMailboxItem.createdAt));
  return { items: items.map(mailboxView) };
}

/**
 * The server takes an item out of the mailbox to hand it to the player. The same key gives it back
 * again (a retry after a timeout); another key finds it already claimed.
 */
async function claim(itemId: string, input: unknown): Promise<EconomyMailboxClaimResult> {
  const body = economyListingActionBody.parse(input);
  return db.transaction(async (tx) => {
    const userId = await ownerOf(tx, body.player);
    const [item] = await tx
      .select()
      .from(economyMailboxItem)
      .where(eq(economyMailboxItem.id, itemId))
      .for('update');
    if (item?.userId !== userId) refuse(404, 'notFound');
    if (item.claimedAt) {
      if (item.claimKey !== body.idempotencyKey) refuse(409, 'alreadyClaimed');
      return { ...mailboxView(item), replayed: true };
    }
    await tx
      .update(economyMailboxItem)
      .set({
        claimedAt: new Date(),
        claimKey: body.idempotencyKey,
        claimedByMinecraftUuid: body.player,
      })
      .where(eq(economyMailboxItem.id, itemId));
    return { ...mailboxView(item), replayed: false };
  });
}

/**
 * The player's sold listings they weren't told about yet, oldest first, 50 at most: the server
 * tells them in the game, then marks them seen.
 */
async function sales(uuid: string): Promise<EconomyServerSales> {
  const userId = await ownerOf(db, uuid);
  const rows = await db
    .select({
      listing: economyListing,
      // The buyer shows as the seller does on a listing: the Minecraft account they bought with.
      buyer: minecraftAccount.username,
      tax: sql<string>`coalesce((select sum(${economyEntry.amount}) from ${economyEntry} where ${economyEntry.transactionId} = ${economyListing.transactionId} and ${economyEntry.accountId} is null), 0)`,
    })
    .from(economyListing)
    .leftJoin(economyTransaction, eq(economyTransaction.id, economyListing.transactionId))
    .leftJoin(minecraftAccount, eq(minecraftAccount.uuid, economyTransaction.actorMinecraftUuid))
    .where(
      and(
        eq(economyListing.sellerUserId, userId),
        eq(economyListing.status, 'sold'),
        isNull(economyListing.sellerNotifiedAt),
      ),
    )
    .orderBy(asc(economyListing.endedAt), asc(economyListing.id))
    .limit(ECONOMY_SALES_PAGE);
  return {
    items: rows.map(({ listing, buyer, tax }) => ({
      listingId: listing.id,
      item: { id: listing.itemId, name: listing.itemName },
      count: listing.count,
      price: listing.price,
      tax: Number(tax),
      buyer: buyer ?? '',
      soldAt: (listing.endedAt ?? listing.createdAt).toISOString(),
    })),
  };
}

/** Marks sales as told to their seller. IDs that aren't sales of this player are ignored. */
async function salesSeen(uuid: string, body: EconomySalesSeenBody): Promise<void> {
  const userId = await ownerOf(db, uuid);
  await db
    .update(economyListing)
    .set({ sellerNotifiedAt: new Date() })
    .where(
      and(
        inArray(economyListing.id, body.listingIds),
        eq(economyListing.sellerUserId, userId),
        eq(economyListing.status, 'sold'),
        isNull(economyListing.sellerNotifiedAt),
      ),
    );
}

export const economyAuctionService = {
  expireDue,
  create,
  list,
  mine,
  cancel,
  buy,
  mailbox,
  claim,
  sales,
  salesSeen,
};
