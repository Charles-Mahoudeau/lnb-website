import { randomUUID } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import {
  economyListing,
  economySettings,
  economyTransaction,
  minecraftAccount,
  user,
} from '~~/server/db/schema';
import { offlineUuid } from '~~/server/lib/minecraft';
import { economyAdminAuctionService } from '~~/server/services/economy/admin-auctions';
import { economyAuctionService } from '~~/server/services/economy/auctions';
import { economyServerService } from '~~/server/services/economy/server';
import { economyStatsService } from '~~/server/services/economy/stats';

import type { EconomyListingBody } from '#shared/schemas/economy';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';

let counter = 0;

/** An Epitech player with a linked Minecraft account. */
async function player(name = 'Auction Tester') {
  const n = ++counter;
  const id = `economy-auction-${String(n)}-${String(Date.now())}`;
  const username = `Auc${String(Date.now() % 100000)}x${String(n)}`.slice(0, 16);
  const uuid = offlineUuid(username);
  await db.insert(user).values({ id, name, email: `${id}@epitech.eu`, tenantId: EPITECH });
  await db.insert(minecraftAccount).values({ uuid, userId: id, username });
  await economyServerService.lookup(uuid);
  return { id, uuid, username };
}

function listing(seller: string, body: Partial<EconomyListingBody> = {}) {
  return economyAuctionService.create({
    idempotencyKey: randomUUID(),
    player: seller,
    item: { id: 'minecraft:diamond', snbt: '{id:"minecraft:diamond",count:16}', name: 'Diamond' },
    count: 16,
    price: 50,
    ...body,
  });
}

function buy(listingId: string, buyer: string, key = randomUUID()) {
  return economyAuctionService.buy(listingId, { idempotencyKey: key, player: buyer });
}

/** Every transaction's lines add up to zero, and every balance matches its lines. */
async function expectLedgerConsistent() {
  const unbalanced = await db.execute(
    sql`select transaction_id from economy_entry group by transaction_id having sum(amount) <> 0`,
  );
  expect(unbalanced.rows).toEqual([]);
  const drift = await db.execute(sql`
    select a.id from economy_account a
    left join economy_entry e on e.account_id = a.id
    group by a.id, a.balance
    having a.balance <> coalesce(sum(e.amount), 0)`);
  expect(drift.rows).toEqual([]);
}

beforeEach(async () => {
  await db
    .update(economySettings)
    .set({ startingBalance: 100, auctionTaxPercent: 10, auctionMaxListings: 2, auctionDays: 7 })
    .where(eq(economySettings.id, 1));
});

afterEach(async () => {
  await db
    .update(economySettings)
    .set({ startingBalance: 0, auctionTaxPercent: 5, auctionMaxListings: 20 })
    .where(eq(economySettings.id, 1));
});

describe('listing', () => {
  it('lists once per key, up to the limit', async () => {
    const seller = await player();
    const key = randomUUID();
    const first = await listing(seller.uuid, { idempotencyKey: key });
    const again = await listing(seller.uuid, { idempotencyKey: key });
    expect(again.id).toBe(first.id);
    expect(first).toMatchObject({
      status: 'active',
      price: 50,
      count: 16,
      seller: seller.username,
    });

    await listing(seller.uuid);
    await expect(listing(seller.uuid)).rejects.toMatchObject({
      data: { problem: 'tooManyListings' },
    });
    expect((await economyAuctionService.mine(seller.uuid)).items).toHaveLength(2);
  });

  it('finds listings by item, cheapest per item first', async () => {
    const seller = await player();
    const name = `Rare gem ${String(++counter)}`;
    const item = { id: 'minecraft:emerald', snbt: '{id:"minecraft:emerald"}', name };
    const dear = await listing(seller.uuid, { item, count: 1, price: 30 });
    const cheap = await listing(seller.uuid, { item, count: 10, price: 100 });
    const page = await economyAuctionService.list({ q: name, sort: 'unitPrice' });
    expect(page.items.map((row) => row.id)).toEqual([cheap.id, dear.id]);
  });
});

describe('buying', () => {
  it('pays the seller minus the tax, burns the tax and mails the item, once per key', async () => {
    const seller = await player();
    const buyer = await player();
    const listed = await listing(seller.uuid);
    const key = randomUUID();

    const bought = await buy(listed.id, buyer.uuid, key);
    const again = await buy(listed.id, buyer.uuid, key);

    expect(bought).toMatchObject({ replayed: false, amount: 50, tax: 5 });
    expect(bought.from.balance).toBe(50);
    expect(bought.to.balance).toBe(145);
    expect(again).toMatchObject({ replayed: true, transactionId: bought.transactionId, tax: 5 });
    expect(again.mailboxItem.id).toBe(bought.mailboxItem.id);

    const [transaction] = await db
      .select()
      .from(economyTransaction)
      .where(eq(economyTransaction.id, bought.transactionId));
    expect(transaction).toMatchObject({
      kind: 'auction',
      reason: 'auctionTax',
      memo: '16 × Diamond',
    });
    await expect(buy(listed.id, buyer.uuid)).rejects.toMatchObject({
      data: { problem: 'listingGone' },
    });
    const stats = await economyStatsService.stats('7d');
    expect(stats.reasons).toContainEqual(
      expect.objectContaining({ direction: 'burn', reason: 'auctionTax' }),
    );
    await expectLedgerConsistent();
  });

  it("refuses buying your own listing, or one you can't pay", async () => {
    const seller = await player();
    const poor = await player();
    const listed = await listing(seller.uuid, { price: 101 });
    await expect(buy(listed.id, seller.uuid)).rejects.toMatchObject({
      data: { problem: 'sameAccount' },
    });
    await expect(buy(listed.id, poor.uuid)).rejects.toMatchObject({
      data: { problem: 'insufficientFunds' },
    });
  });
});

describe('mailbox', () => {
  it('gives an item to the key that claimed it, and only once', async () => {
    const seller = await player();
    const buyer = await player();
    const bought = await buy((await listing(seller.uuid)).id, buyer.uuid);
    const item = bought.mailboxItem.id;
    const key = randomUUID();

    expect((await economyAuctionService.mailbox(buyer.uuid)).items.map((row) => row.id)).toEqual([
      item,
    ]);
    const first = await economyAuctionService.claim(item, {
      idempotencyKey: key,
      player: buyer.uuid,
    });
    const again = await economyAuctionService.claim(item, {
      idempotencyKey: key,
      player: buyer.uuid,
    });
    expect(first).toMatchObject({ replayed: false, count: 16 });
    expect(again.replayed).toBe(true);
    await expect(
      economyAuctionService.claim(item, { idempotencyKey: randomUUID(), player: buyer.uuid }),
    ).rejects.toMatchObject({ data: { problem: 'alreadyClaimed' } });
    await expect(
      economyAuctionService.claim(item, { idempotencyKey: randomUUID(), player: seller.uuid }),
    ).rejects.toMatchObject({ data: { problem: 'notFound' } });
    expect((await economyAuctionService.mailbox(buyer.uuid)).items).toEqual([]);
  });

  it('sends back cancelled, expired and removed listings to their seller', async () => {
    const seller = await player();
    const other = await player();
    const admin = await player('Auction Admin');
    const cancelled = await listing(seller.uuid);
    await expect(
      economyAuctionService.cancel(cancelled.id, {
        idempotencyKey: randomUUID(),
        player: other.uuid,
      }),
    ).rejects.toMatchObject({ data: { problem: 'notAllowed' } });
    await economyAuctionService.cancel(cancelled.id, {
      idempotencyKey: randomUUID(),
      player: seller.uuid,
    });

    const expired = await listing(seller.uuid);
    await db
      .update(economyListing)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(economyListing.id, expired.id));
    await expect(buy(expired.id, other.uuid)).rejects.toMatchObject({
      data: { problem: 'listingGone' },
    });

    const removed = await listing(seller.uuid);
    const row = await economyAdminAuctionService.remove(admin.id, removed.id, 'Offensive name');
    expect(row.status).toBe('cancelled');

    const reasons = (await economyAuctionService.mailbox(seller.uuid)).items.map(
      (item) => item.reason,
    );
    expect(reasons).toEqual(['cancelled', 'expired', 'removed']);
  });
});
