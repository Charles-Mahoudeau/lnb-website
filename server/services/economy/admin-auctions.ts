import { aliasedTable, and, desc, eq, ilike, or, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  economyAccount,
  economyListing,
  economyMailboxItem,
  minecraftAccount,
  user,
} from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';

import { escapeLike } from './admin';
import { economyAuctionService } from './auctions';
import { PAGE_SIZE, refuse } from './shared';

import type {
  EconomyAdminListingPage,
  EconomyAdminListingRow,
  EconomyAdminListingsQuery,
} from '#shared/schemas/economy';

// The auction house in the admin: every listing, and taking one down. See docs/economy.md.

const buyer = aliasedTable(user, 'buyer');

function selectRows() {
  return db
    .select({
      listing: economyListing,
      seller: minecraftAccount.username,
      handle: economyAccount.handle,
      buyerName: buyer.name,
    })
    .from(economyListing)
    .leftJoin(minecraftAccount, eq(minecraftAccount.uuid, economyListing.sellerMinecraftUuid))
    .innerJoin(economyAccount, eq(economyAccount.id, economyListing.accountId))
    .leftJoin(buyer, eq(buyer.id, economyListing.buyerUserId));
}

type Found = Awaited<ReturnType<typeof selectRows>>[number];

function toRow({ listing, seller, handle, buyerName }: Found): EconomyAdminListingRow {
  return {
    id: listing.id,
    item: { id: listing.itemId, name: listing.itemName, snbt: listing.itemSnbt },
    count: listing.count,
    price: listing.price,
    seller: seller ?? '',
    status: listing.status,
    createdAt: listing.createdAt.toISOString(),
    expiresAt: listing.expiresAt.toISOString(),
    sellerUserId: listing.sellerUserId,
    account: { id: listing.accountId, handle },
    buyer:
      listing.buyerUserId && buyerName ? { userId: listing.buyerUserId, name: buyerName } : null,
    endedAt: listing.endedAt?.toISOString() ?? null,
  };
}

/** Every listing, newest first, with a search on the item and the seller. */
async function list(query: EconomyAdminListingsQuery): Promise<EconomyAdminListingPage> {
  await economyAuctionService.expireDue(db);
  let after: { at: Date; id: string } | undefined;
  if (query.cursor) {
    const [at, id] = query.cursor.split(':');
    if (!at || !id || !Number.isSafeInteger(Number(at))) refuse(400, 'invalidCursor');
    after = { at: new Date(Number(at)), id };
  }
  const search = query.q ? escapeLike(query.q) : undefined;
  const found = await selectRows()
    .where(
      and(
        query.status ? eq(economyListing.status, query.status) : undefined,
        search
          ? or(
              ilike(economyListing.itemName, search),
              ilike(economyListing.itemId, search),
              ilike(minecraftAccount.username, search),
            )
          : undefined,
        after
          ? sql`(${economyListing.createdAt}, ${economyListing.id}) < (${after.at}, ${after.id})`
          : undefined,
      ),
    )
    .orderBy(desc(economyListing.createdAt), desc(economyListing.id))
    .limit(PAGE_SIZE + 1);
  const items = found.slice(0, PAGE_SIZE).map(toRow);
  const last = found.at(PAGE_SIZE - 1);
  return {
    items,
    nextCursor:
      found.length > PAGE_SIZE && last
        ? `${String(last.listing.createdAt.getTime())}:${last.listing.id}`
        : null,
  };
}

/** Takes a listing down: its item goes back to its seller's mailbox. */
async function remove(
  actorId: string,
  listingId: string,
  reason: string,
): Promise<EconomyAdminListingRow> {
  await db.transaction(async (tx) => {
    const [listing] = await tx
      .select()
      .from(economyListing)
      .where(eq(economyListing.id, listingId))
      .for('update');
    if (!listing) refuse(404, 'notFound');
    if (listing.status !== 'active') refuse(409, 'listingGone');
    await tx
      .update(economyListing)
      .set({ status: 'cancelled', endedAt: new Date() })
      .where(eq(economyListing.id, listingId));
    await tx.insert(economyMailboxItem).values({
      userId: listing.sellerUserId,
      listingId,
      reason: 'removed',
      itemId: listing.itemId,
      itemSnbt: listing.itemSnbt,
      itemName: listing.itemName,
      count: listing.count,
    });
    const [seller] = await tx
      .select({ username: minecraftAccount.username })
      .from(minecraftAccount)
      .where(eq(minecraftAccount.uuid, listing.sellerMinecraftUuid));
    await adminAuditService.record(tx, {
      action: 'economy.listingRemove',
      actorUserId: actorId,
      targetUserId: listing.sellerUserId,
      data: {
        name: `${String(listing.count)} × ${listing.itemName}, ${seller?.username ?? ''}`,
        listingId,
        reason,
      },
    });
  });
  const [row] = await selectRows().where(eq(economyListing.id, listingId));
  if (!row) refuse(404, 'notFound');
  return toRow(row);
}

export const economyAdminAuctionService = { list, remove };
