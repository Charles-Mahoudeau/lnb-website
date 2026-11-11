import { randomUUID } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import {
  economyAccount,
  economySettings,
  economyShop,
  economyShopOrder,
  economyTransaction,
  minecraftAccount,
  user,
} from '~~/server/db/schema';
import { offlineUuid } from '~~/server/lib/minecraft';
import { economyAccountService } from '~~/server/services/economy/accounts';
import { economyAdminShopService } from '~~/server/services/economy/admin-shops';
import { economyServerService } from '~~/server/services/economy/server';
import { economyShopService } from '~~/server/services/economy/shops';

import type { EconomyShopOrderBody, EconomyShopSettings } from '#shared/schemas/economy';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';

let counter = 0;

/** An Epitech player with a linked Minecraft account. */
async function player(name = 'Shop Tester') {
  const n = ++counter;
  const id = `economy-shop-${String(n)}-${String(Date.now())}`;
  const username = `Shp${String(Date.now() % 100000)}x${String(n)}`.slice(0, 16);
  const uuid = offlineUuid(username);
  await db.insert(user).values({ id, name, email: `${id}@epitech.eu`, tenantId: EPITECH });
  await db.insert(minecraftAccount).values({ uuid, userId: id, username });
  return { id, uuid, username };
}

async function balanceOf(accountId: string): Promise<number> {
  const [row] = await db
    .select({ balance: economyAccount.balance })
    .from(economyAccount)
    .where(eq(economyAccount.id, accountId));
  return row?.balance ?? -1;
}

/** A shop selling 16 diamonds for 40, run by an owner and a member of `#shop-N`. */
async function shop(settings: Partial<EconomyShopSettings> = {}) {
  const owner = await player('Shop Owner');
  const clerk = await player('Shop Clerk');
  const handle = `shop-${String(++counter)}`;
  const account = await economyAccountService.create(owner.id, { name: 'Shop', handle });
  await economyAccountService.invite(owner.id, account.id, {
    username: clerk.username,
    role: 'member',
  });
  const invitation = (await economyAccountService.me(clerk.id)).invitations[0];
  await economyAccountService.acceptInvitation(clerk.id, invitation?.id ?? '');
  const created = await economyShopService.create({ ...base(owner.uuid, handle), ...settings });
  return { owner, clerk, account, handle, shop: created };
}

function base(uuid: string, account: string): EconomyShopSettings {
  return {
    player: uuid,
    account,
    item: { id: 'minecraft:diamond', snbt: '{id:"minecraft:diamond",count:16}', name: 'Diamond' },
    lotSize: 16,
    sellPrice: 40,
    buyPrice: 25,
    position: { world: 'minecraft:overworld', x: 10, y: 64, z: -3 },
  };
}

function order(shopId: string, body: Partial<EconomyShopOrderBody> & { player: string }) {
  return economyShopService.order(shopId, {
    idempotencyKey: randomUUID(),
    direction: 'buy',
    lots: 1,
    expectedLotPrice: 40,
    ...body,
  });
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
  await db.update(economySettings).set({ startingBalance: 100 }).where(eq(economySettings.id, 1));
});

afterEach(async () => {
  await db.update(economySettings).set({ startingBalance: 0 }).where(eq(economySettings.id, 1));
});

describe('registering shops', () => {
  it('saves a shop for an account its creator can spend from', async () => {
    const { shop: created, account } = await shop();
    expect(created).toMatchObject({
      account: { id: account.id, kind: 'shared' },
      item: { id: 'minecraft:diamond', name: 'Diamond' },
      lotSize: 16,
      sellPrice: 40,
      buyPrice: 25,
      disabled: false,
    });
    expect(await economyShopService.get(created.id)).toEqual(created);
  });

  it('refuses an account the player can only read, or not at all', async () => {
    const { handle } = await shop();
    const stranger = await player();
    await expect(economyShopService.create(base(stranger.uuid, handle))).rejects.toMatchObject({
      data: { problem: 'notAllowed' },
    });
  });

  it('refuses a buy-back price above the sell price', async () => {
    const owner = await player();
    await economyServerService.lookup(owner.uuid);
    await expect(
      economyShopService.create({ ...base(owner.uuid, owner.uuid), buyPrice: 41 }),
    ).rejects.toThrow();
  });

  it('comes back on when its owner saves it again, but not after an admin turned it off', async () => {
    const { shop: created, clerk, handle } = await shop();
    await economyShopService.remove(created.id);
    expect((await economyShopService.remove(created.id)).disabledReason).toBe('removed');
    const saved = await economyShopService.update(created.id, {
      ...base(clerk.uuid, handle),
      sellPrice: 50,
      buyPrice: undefined,
    });
    expect(saved).toMatchObject({ disabled: false, sellPrice: 50, buyPrice: null });

    await db
      .update(economyShop)
      .set({ disabledAt: new Date(), disabledReason: 'admin' })
      .where(eq(economyShop.id, created.id));
    await expect(
      economyShopService.update(created.id, base(clerk.uuid, handle)),
    ).rejects.toMatchObject({ data: { problem: 'shopDisabled' } });
  });
});

describe('orders', () => {
  it('sells lots at the saved price, once per key', async () => {
    const { shop: created, account } = await shop();
    const buyer = await player();
    const key = randomUUID();
    const body = { idempotencyKey: key, player: buyer.uuid, lots: 2 };

    const first = await order(created.id, body);
    const again = await order(created.id, body);

    expect(first).toMatchObject({ replayed: false, amount: 80, lots: 2, lotPrice: 40 });
    expect(first.to).toMatchObject({ accountId: account.id, balance: 80 });
    expect(first.from.balance).toBe(20);
    expect(again).toMatchObject({ replayed: true, transactionId: first.transactionId, lots: 2 });
    expect(await balanceOf(account.id)).toBe(80);

    const [transaction] = await db
      .select()
      .from(economyTransaction)
      .where(eq(economyTransaction.id, first.transactionId));
    expect(transaction).toMatchObject({ kind: 'shop', memo: '32 × Diamond' });
    const orders = await db
      .select()
      .from(economyShopOrder)
      .where(eq(economyShopOrder.shopId, created.id));
    expect(orders).toHaveLength(1);
    await expectLedgerConsistent();
  });

  it('refuses the same key for another order', async () => {
    const { shop: created } = await shop();
    const buyer = await player();
    const key = randomUUID();
    await order(created.id, { idempotencyKey: key, player: buyer.uuid });
    await expect(
      order(created.id, { idempotencyKey: key, player: buyer.uuid, lots: 2 }),
    ).rejects.toMatchObject({ data: { problem: 'idempotencyMismatch' } });
  });

  it('refuses an order at a price the player no longer sees', async () => {
    const { shop: created } = await shop();
    const buyer = await player();
    await expect(
      order(created.id, { player: buyer.uuid, expectedLotPrice: 30 }),
    ).rejects.toMatchObject({ data: { problem: 'priceChanged' } });
  });

  it('buys back from its own account, without an owner around', async () => {
    const { shop: created, owner, account, handle } = await shop();
    await economyServerService.transfer({
      idempotencyKey: randomUUID(),
      from: { player: owner.uuid },
      to: { account: handle },
      amount: 60,
    });
    const seller = await player();

    const sold = await order(created.id, {
      player: seller.uuid,
      direction: 'sell',
      lots: 2,
      expectedLotPrice: 25,
    });

    expect(sold).toMatchObject({ amount: 50, direction: 'sell' });
    expect(await balanceOf(account.id)).toBe(10);
    expect(sold.to.balance).toBe(150);
    await expect(
      order(created.id, { player: seller.uuid, direction: 'sell', expectedLotPrice: 25 }),
    ).rejects.toMatchObject({ data: { problem: 'insufficientFunds' } });
    await expectLedgerConsistent();
  });

  it("refuses to sell back to a shop that doesn't buy", async () => {
    const { shop: created } = await shop({ buyPrice: undefined });
    const seller = await player();
    await expect(
      order(created.id, { player: seller.uuid, direction: 'sell', expectedLotPrice: 25 }),
    ).rejects.toMatchObject({ data: { problem: 'noBuyBack' } });
  });

  it('refuses orders at a closed shop, and paying the shop with its own account', async () => {
    const { shop: created, clerk, handle } = await shop();
    await expect(order(created.id, { player: clerk.uuid, account: handle })).rejects.toMatchObject({
      data: { problem: 'sameAccount' },
    });

    await economyShopService.remove(created.id);
    const buyer = await player();
    await expect(order(created.id, { player: buyer.uuid })).rejects.toMatchObject({
      data: { problem: 'shopDisabled' },
    });
  });
});

describe('admins', () => {
  it('turn a shop off and back on, and find it by item or account', async () => {
    const { shop: created, owner, handle } = await shop();
    const admin = await player('Shop Admin');

    const off = await economyAdminShopService.patch(admin.id, created.id, { disabled: true });
    expect(off).toMatchObject({ disabled: true, disabledReason: 'admin', orders: 0 });
    const buyer = await player();
    await expect(order(created.id, { player: buyer.uuid })).rejects.toMatchObject({
      data: { problem: 'shopDisabled' },
    });

    await economyAdminShopService.patch(admin.id, created.id, { disabled: false });
    await order(created.id, { player: buyer.uuid, lots: 2 });
    const page = await economyAdminShopService.list({ q: `#${handle}` });
    expect(page.items).toMatchObject([
      { id: created.id, disabled: false, orders: 1, volume: 80, createdBy: { userId: owner.id } },
    ]);
    expect((await economyAdminShopService.list({ q: 'diamond', status: 'off' })).items).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ id: created.id })]),
    );
  });

  it("can't turn back on a shop whose block was broken", async () => {
    const { shop: created } = await shop();
    const admin = await player('Shop Admin');
    await economyShopService.remove(created.id);
    await expect(
      economyAdminShopService.patch(admin.id, created.id, { disabled: false }),
    ).rejects.toMatchObject({ data: { problem: 'shopDisabled' } });
  });
});
