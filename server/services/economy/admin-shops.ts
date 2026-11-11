import {
  aliasedTable,
  and,
  count,
  desc,
  eq,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  sql,
  sum,
} from 'drizzle-orm';

import { db } from '~~/server/db';
import { economyAccount, economyShop, economyShopOrder, user } from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';

import { auditName, escapeLike } from './admin';
import { PAGE_SIZE, refuse } from './shared';

import type {
  EconomyAdminShopPage,
  EconomyAdminShopPatch,
  EconomyAdminShopRow,
  EconomyAdminShopsQuery,
} from '#shared/schemas/economy';

// Player shops in the admin: every shop with its orders, and turning one off or back on.
// See docs/economy.md.

const owner = aliasedTable(user, 'owner');
const creator = aliasedTable(user, 'creator');

function selectRows() {
  return db
    .select({
      shop: economyShop,
      account: economyAccount,
      ownerName: owner.name,
      creatorName: creator.name,
    })
    .from(economyShop)
    .innerJoin(economyAccount, eq(economyAccount.id, economyShop.accountId))
    .leftJoin(owner, eq(owner.id, economyAccount.ownerUserId))
    .leftJoin(creator, eq(creator.id, economyShop.createdByUserId));
}

type Found = Awaited<ReturnType<typeof selectRows>>[number];

async function toRows(found: readonly Found[]): Promise<EconomyAdminShopRow[]> {
  const ids = found.map((row) => row.shop.id);
  const totals = ids.length
    ? await db
        .select({
          shopId: economyShopOrder.shopId,
          orders: count(),
          volume: sum(sql`${economyShopOrder.lots} * ${economyShopOrder.lotPrice}`),
        })
        .from(economyShopOrder)
        .where(inArray(economyShopOrder.shopId, ids))
        .groupBy(economyShopOrder.shopId)
    : [];
  const byShop = new Map(totals.map((row) => [row.shopId, row]));
  return found.map(({ shop, account, ownerName, creatorName }) => ({
    id: shop.id,
    account: {
      id: account.id,
      kind: account.kind,
      handle: account.handle,
      name: account.name ?? ownerName ?? '',
    },
    item: { id: shop.itemId, name: shop.itemName },
    lotSize: shop.lotSize,
    sellPrice: shop.sellPrice,
    buyPrice: shop.buyPrice,
    position: { world: shop.world, x: shop.x, y: shop.y, z: shop.z },
    disabled: Boolean(shop.disabledAt),
    disabledReason: shop.disabledReason,
    disabledAt: shop.disabledAt?.toISOString() ?? null,
    createdBy:
      shop.createdByUserId && creatorName
        ? { userId: shop.createdByUserId, name: creatorName }
        : null,
    createdAt: shop.createdAt.toISOString(),
    orders: byShop.get(shop.id)?.orders ?? 0,
    volume: Number(byShop.get(shop.id)?.volume ?? 0),
  }));
}

/** Every shop, newest first, with a search on the item and the account. */
async function list(query: EconomyAdminShopsQuery): Promise<EconomyAdminShopPage> {
  let after: { at: Date; id: string } | undefined;
  if (query.cursor) {
    const [at, id] = query.cursor.split(':');
    if (!at || !id || !Number.isSafeInteger(Number(at))) refuse(400, 'invalidCursor');
    after = { at: new Date(Number(at)), id };
  }
  const search = query.q ? escapeLike(query.q.replace(/^#/, '')) : undefined;
  const found = await selectRows()
    .where(
      and(
        query.status === 'on' ? isNull(economyShop.disabledAt) : undefined,
        query.status === 'off' ? isNotNull(economyShop.disabledAt) : undefined,
        search
          ? or(
              ilike(economyShop.itemName, search),
              ilike(economyShop.itemId, search),
              ilike(economyAccount.handle, search),
              ilike(economyAccount.name, search),
            )
          : undefined,
        after
          ? sql`(${economyShop.createdAt}, ${economyShop.id}) < (${after.at}, ${after.id})`
          : undefined,
      ),
    )
    .orderBy(desc(economyShop.createdAt), desc(economyShop.id))
    .limit(PAGE_SIZE + 1);
  const items = await toRows(found.slice(0, PAGE_SIZE));
  const last = found.at(PAGE_SIZE - 1);
  return {
    items,
    nextCursor:
      found.length > PAGE_SIZE && last
        ? `${String(last.shop.createdAt.getTime())}:${last.shop.id}`
        : null,
  };
}

/**
 * Turns a shop off, or back on. A shop whose block was broken can't come back from here: only its
 * owner saving it again in the game does that.
 */
async function patch(
  actorId: string,
  shopId: string,
  body: EconomyAdminShopPatch,
): Promise<EconomyAdminShopRow> {
  await db.transaction(async (tx) => {
    const [shop] = await tx
      .select()
      .from(economyShop)
      .where(eq(economyShop.id, shopId))
      .for('update');
    if (!shop) refuse(404, 'notFound');
    if (body.disabled === Boolean(shop.disabledAt)) return;
    if (!body.disabled && shop.disabledReason === 'removed') refuse(409, 'shopDisabled');
    await tx
      .update(economyShop)
      .set(
        body.disabled
          ? { disabledAt: new Date(), disabledReason: 'admin', disabledByUserId: actorId }
          : { disabledAt: null, disabledReason: null, disabledByUserId: null },
      )
      .where(eq(economyShop.id, shopId));
    const [account] = await tx
      .select()
      .from(economyAccount)
      .where(eq(economyAccount.id, shop.accountId));
    await adminAuditService.record(tx, {
      action: body.disabled ? 'economy.shopDisable' : 'economy.shopEnable',
      actorUserId: actorId,
      targetUserId: account?.ownerUserId ?? null,
      data: {
        name: `${shop.itemName}, ${account ? await auditName(tx, account) : ''}`,
        shopId,
      },
    });
  });
  const [row] = await toRows(await selectRows().where(eq(economyShop.id, shopId)));
  if (!row) refuse(404, 'notFound');
  return row;
}

export const economyAdminShopService = { list, patch };
