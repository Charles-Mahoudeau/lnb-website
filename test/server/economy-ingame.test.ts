import { randomUUID } from 'node:crypto';

import { eq, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import {
  adminAudit,
  economyAccount,
  economyCasinoLicense,
  economySettings,
  minecraftAccount,
  user,
  wardenBan,
} from '~~/server/db/schema';
import { offlineUuid } from '~~/server/lib/minecraft';
import { economyAccountService } from '~~/server/services/economy/accounts';
import { economyAdminService } from '~~/server/services/economy/admin';
import { economyAuctionService } from '~~/server/services/economy/auctions';
import { economyServerService } from '~~/server/services/economy/server';
import { economyServerAccountService } from '~~/server/services/economy/server-accounts';
import { economySettingsService } from '~~/server/services/economy/settings';
import { economyStatsService } from '~~/server/services/economy/stats';

// Pass 3 of the economy: account types, shared accounts from the game, casino licences, mob drops
// and sale notices. See docs/economy.md.

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';

let counter = 0;

/** An Epitech player with a linked Minecraft account and 1000 LNBits. */
async function player(name = 'Game Tester') {
  const n = ++counter;
  const id = `economy-ingame-${String(n)}-${String(Date.now())}`;
  const username = `Ing${String(Date.now() % 100000)}x${String(n)}`.slice(0, 16);
  const uuid = offlineUuid(username);
  await db.insert(user).values({ id, name, email: `${id}@epitech.eu`, tenantId: EPITECH });
  await db.insert(minecraftAccount).values({ uuid, userId: id, username });
  await economyServerService.lookup(uuid);
  return { id, uuid, username };
}

function handle(prefix = 'game'): string {
  return `${prefix}-${String(++counter)}-${String(Date.now() % 1_000_000)}`;
}

function license(buyer: string, key = randomUUID(), account?: string) {
  return economyServerService.buyLicense({ idempotencyKey: key, player: buyer, account });
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
    .set({ startingBalance: 1000, casinoLicensePrice: 400, maxOwnedShared: 3 })
    .where(eq(economySettings.id, 1));
});

afterEach(async () => {
  await db
    .update(economySettings)
    .set({ startingBalance: 0, casinoLicensePrice: 100_000 })
    .where(eq(economySettings.id, 1));
});

describe('account types', () => {
  it('opens a team by default, and shows the type everywhere', async () => {
    const owner = await player();
    const name = handle();
    const created = await economyAccountService.create(owner.id, { name: 'Crew', handle: name });
    expect(created.type).toBe('team');
    const me = await economyAccountService.me(owner.id);
    expect(me.accounts.map((account) => account.type)).toEqual([null, 'team']);
    expect((await economyServerService.account(name)).type).toBe('team');
    expect((await economyAdminService.detail(created.id)).type).toBe('team');
    const lookup = await economyServerService.lookup(owner.uuid);
    expect(lookup.accounts.map((account) => account.type)).toEqual([null, 'team']);
  });

  it('lets owners switch between team and shop, and nobody else', async () => {
    const owner = await player();
    const guest = await player();
    const account = await economyAccountService.create(owner.id, {
      name: 'Stall',
      handle: handle(),
      type: 'shop',
    });
    expect(account.type).toBe('shop');
    await economyAccountService.update(owner.id, account.id, { type: 'team' });
    expect((await economyAccountService.view(owner.id, account.id)).type).toBe('team');
    await economyAccountService.update(owner.id, account.id, { name: 'Stand', type: 'shop' });
    expect(await economyAccountService.view(owner.id, account.id)).toMatchObject({
      name: 'Stand',
      type: 'shop',
    });
    const invitation = await economyAccountService.invite(owner.id, account.id, {
      username: guest.username,
      role: 'member',
    });
    await economyAccountService.acceptInvitation(guest.id, invitation.id);
    await expect(
      economyAccountService.update(guest.id, account.id, { type: 'team' }),
    ).rejects.toMatchObject({ statusCode: 403, data: { problem: 'notAllowed' } });
  });

  it('needs a free licence for a casino, and binds it for good', async () => {
    const owner = await player();
    await expect(
      economyAccountService.create(owner.id, { name: 'Royal', handle: handle(), type: 'casino' }),
    ).rejects.toMatchObject({ statusCode: 403, data: { problem: 'noLicense' } });
    const team = await economyAccountService.create(owner.id, { name: 'Royal', handle: handle() });
    await expect(
      economyAccountService.update(owner.id, team.id, { type: 'casino' }),
    ).rejects.toMatchObject({ statusCode: 403, data: { problem: 'noLicense' } });

    await license(owner.uuid);
    await economyAccountService.update(owner.id, team.id, { type: 'casino' });
    expect((await economyAccountService.me(owner.id)).casinoLicenses).toEqual({
      total: 1,
      free: 0,
    });
    // The one licence is used: a second casino needs another.
    await expect(
      economyAccountService.create(owner.id, { name: 'Second', handle: handle(), type: 'casino' }),
    ).rejects.toMatchObject({ data: { problem: 'noLicense' } });

    await expect(
      economyAccountService.update(owner.id, team.id, { type: 'shop' }),
    ).rejects.toMatchObject({ statusCode: 409, data: { problem: 'typeLocked' } });
    // Renaming a casino still works, also when its own type is sent along.
    await economyAccountService.update(owner.id, team.id, { name: 'Royale', type: 'casino' });
    expect((await economyAccountService.view(owner.id, team.id)).name).toBe('Royale');

    // Closing the casino doesn't free its licence.
    await economyAccountService.close(owner.id, team.id);
    expect((await economyAccountService.me(owner.id)).casinoLicenses).toEqual({
      total: 1,
      free: 0,
    });
  });

  it('lets an admin set any type without a licence, in the audit log', async () => {
    const admin = await player('Type Admin');
    const owner = await player();
    const account = await economyAccountService.create(owner.id, {
      name: 'Old Casino',
      handle: handle(),
    });
    const detail = await economyAdminService.setType(admin.id, account.id, 'casino');
    expect(detail.type).toBe('casino');
    const [entry] = await db.select().from(adminAudit).where(eq(adminAudit.actorUserId, admin.id));
    expect(entry).toMatchObject({
      action: 'economy.accountType',
      data: { accountId: account.id, from: 'team', type: 'casino' },
    });
    await expect(
      economyAccountService.update(owner.id, account.id, { type: 'team' }),
    ).rejects.toMatchObject({ data: { problem: 'typeLocked' } });
    expect((await economyAdminService.setType(admin.id, account.id, 'team')).type).toBe('team');
    const personal = (await economyServerService.lookup(owner.uuid)).accounts[0]?.id ?? '';
    await expect(economyAdminService.setType(admin.id, personal, 'shop')).rejects.toMatchObject({
      data: { problem: 'personalAccount' },
    });
  });
});

describe('shared accounts from the game', () => {
  it('opens an account with the player as owner, under the site rules', async () => {
    const owner = await player();
    const name = handle();
    const view = await economyServerAccountService.create({
      player: owner.uuid,
      handle: `#${name}`,
      name: 'Miners',
      type: 'shop',
    });
    expect(view).toMatchObject({
      kind: 'shared',
      type: 'shop',
      handle: name,
      name: 'Miners',
      role: 'owner',
      balance: 0,
      memberCount: 1,
    });
    await expect(
      economyServerAccountService.create({ player: owner.uuid, handle: name, name: 'Copy' }),
    ).rejects.toMatchObject({ statusCode: 409, data: { problem: 'handleTaken' } });
    await expect(
      economyServerAccountService.create({ player: owner.uuid, handle: 'staff', name: 'Staff' }),
    ).rejects.toMatchObject({ statusCode: 409, data: { problem: 'handleReserved' } });
    await expect(
      economyServerAccountService.create({
        player: owner.uuid,
        handle: handle(),
        name: 'Casino',
        type: 'casino',
      }),
    ).rejects.toMatchObject({ statusCode: 403, data: { problem: 'noLicense' } });
    await expect(
      economyServerAccountService.create({
        player: randomUUID(),
        handle: handle(),
        name: 'Ghost',
      }),
    ).rejects.toMatchObject({ statusCode: 404, data: { problem: 'notLinked' } });

    await db.update(economySettings).set({ maxOwnedShared: 1 }).where(eq(economySettings.id, 1));
    await expect(
      economyServerAccountService.create({ player: owner.uuid, handle: handle(), name: 'More' }),
    ).rejects.toMatchObject({ statusCode: 409, data: { problem: 'tooManyAccounts' } });
  });

  it('lets only owners rename and retype', async () => {
    const owner = await player();
    const outsider = await player();
    const name = handle();
    await economyServerAccountService.create({ player: owner.uuid, handle: name, name: 'Crew' });
    const updated = await economyServerAccountService.update(name, {
      player: owner.uuid,
      name: 'Crew Two',
      type: 'shop',
    });
    expect(updated).toMatchObject({ name: 'Crew Two', type: 'shop', role: 'owner' });
    await expect(
      economyServerAccountService.update(name, { player: outsider.uuid, name: 'Mine' }),
    ).rejects.toMatchObject({ statusCode: 403, data: { problem: 'notAllowed' } });
    await expect(
      economyServerAccountService.update(name, { player: owner.uuid, type: 'casino' }),
    ).rejects.toMatchObject({ statusCode: 403, data: { problem: 'noLicense' } });
    await expect(
      economyServerAccountService.update(handle('nope'), { player: owner.uuid, name: 'X' }),
    ).rejects.toMatchObject({ statusCode: 404, data: { problem: 'notFound' } });
  });

  it('invites, lists, accepts and declines from the game', async () => {
    const owner = await player();
    const friend = await player();
    const other = await player();
    const name = handle();
    const account = await economyServerAccountService.create({
      player: owner.uuid,
      handle: name,
      name: 'Crew',
    });

    const invitation = await economyServerAccountService.invite(name, {
      player: owner.uuid,
      username: friend.username,
    });
    expect(invitation).toMatchObject({
      username: friend.username,
      account: { id: account.id, handle: name, name: 'Crew', type: 'team' },
      role: 'member',
      invitedBy: owner.username,
      inviteeUuids: [friend.uuid],
    });
    await expect(
      economyServerAccountService.invite(name, { player: owner.uuid, username: friend.username }),
    ).rejects.toMatchObject({ statusCode: 409, data: { problem: 'alreadyInvited' } });
    await expect(
      economyServerAccountService.invite(name, { player: owner.uuid, username: 'Nobody_Here' }),
    ).rejects.toMatchObject({ statusCode: 404, data: { problem: 'playerNotFound' } });
    await expect(
      economyServerAccountService.invite(name, { player: friend.uuid, username: other.username }),
    ).rejects.toMatchObject({ statusCode: 403, data: { problem: 'notAllowed' } });

    expect(await economyServerAccountService.invitations(friend.uuid)).toMatchObject({
      items: [
        {
          id: invitation.id,
          account: { id: account.id, handle: name, name: 'Crew', type: 'team' },
          invitedBy: owner.username,
        },
      ],
    });
    // Owners see who is in and who was asked; the invited player isn't in yet.
    const before = await economyServerAccountService.members(name, owner.uuid);
    expect(before.account).toMatchObject({ id: account.id, role: 'owner' });
    expect(before.members).toEqual([{ userId: owner.id, username: owner.username, role: 'owner' }]);
    expect(before.invitations).toMatchObject([{ id: invitation.id, username: friend.username }]);
    await expect(economyServerAccountService.members(name, friend.uuid)).rejects.toMatchObject({
      statusCode: 403,
      data: { problem: 'notAllowed' },
    });

    const joined = await economyServerAccountService.accept(invitation.id, friend.uuid);
    expect(joined).toMatchObject({ id: account.id, role: 'member', memberCount: 2 });
    await expect(
      economyServerAccountService.accept(invitation.id, friend.uuid),
    ).rejects.toMatchObject({ statusCode: 404, data: { problem: 'notFound' } });
    await expect(
      economyServerAccountService.invite(name, { player: owner.uuid, username: friend.username }),
    ).rejects.toMatchObject({ statusCode: 409, data: { problem: 'alreadyMember' } });
    // Members read the list, without the invitations.
    const second = await economyServerAccountService.invite(name, {
      player: owner.uuid,
      username: other.username,
      role: 'viewer',
    });
    const seen = await economyServerAccountService.members(name, friend.uuid);
    expect(seen.members).toHaveLength(2);
    expect(seen.invitations).toEqual([]);

    await economyServerAccountService.decline(second.id, other.uuid);
    expect((await economyServerAccountService.invitations(other.uuid)).items).toEqual([]);
    expect((await economyServerAccountService.members(name, owner.uuid)).invitations).toEqual([]);
  });

  it('lets only owners cancel an invitation, and keeps the account full', async () => {
    const owner = await player();
    const friend = await player();
    const other = await player();
    const name = handle();
    await economyServerAccountService.create({ player: owner.uuid, handle: name, name: 'Duo' });
    await db.update(economySettings).set({ maxMembers: 2 }).where(eq(economySettings.id, 1));
    try {
      const invitation = await economyServerAccountService.invite(name, {
        player: owner.uuid,
        username: friend.username,
      });
      await expect(
        economyServerAccountService.invite(name, { player: owner.uuid, username: other.username }),
      ).rejects.toMatchObject({ statusCode: 409, data: { problem: 'tooManyMembers' } });
      await expect(
        economyServerAccountService.cancelInvitation(name, invitation.id, friend.uuid),
      ).rejects.toMatchObject({ statusCode: 403, data: { problem: 'notAllowed' } });
      await economyServerAccountService.cancelInvitation(name, invitation.id, owner.uuid);
      await expect(
        economyServerAccountService.cancelInvitation(name, invitation.id, owner.uuid),
      ).rejects.toMatchObject({ statusCode: 404, data: { problem: 'notFound' } });
      expect((await economyServerAccountService.invitations(friend.uuid)).items).toEqual([]);
    } finally {
      await db.update(economySettings).set({ maxMembers: 20 }).where(eq(economySettings.id, 1));
    }
  });
});

describe('casino licences', () => {
  it('burns the price once per key, and counts the licences', async () => {
    const buyer = await player();
    const before = await economyServerService.lookup(buyer.uuid);
    expect(before).toMatchObject({
      casinoLicenses: { total: 0, free: 0 },
      casinoLicensePrice: 400,
    });
    const key = randomUUID();
    const bought = await license(buyer.uuid, key);
    expect(bought).toMatchObject({
      replayed: false,
      amount: 400,
      from: { accountId: before.defaultAccountId, handle: null, balance: 600 },
      licenses: { total: 1, free: 1 },
    });
    const again = await license(buyer.uuid, key);
    expect(again).toEqual({ ...bought, replayed: true });
    await expect(
      economyServerService.buyLicense({ idempotencyKey: key, player: buyer.uuid, account: 'x-y' }),
    ).rejects.toMatchObject({ statusCode: 409, data: { problem: 'idempotencyMismatch' } });

    const page = await economyAccountService.transactions(
      buyer.id,
      before.defaultAccountId,
      undefined,
    );
    expect(page.items[0]).toMatchObject({
      id: bought.transactionId,
      kind: 'burn',
      reason: 'casinoLicense',
      memo: 'Casino licence',
      amount: -400,
      counterparty: { type: 'lnb' },
    });
    const stats = await economyStatsService.stats('7d');
    const burned = stats.reasons.find(
      (row) => row.direction === 'burn' && row.reason === 'casinoLicense',
    );
    expect(burned?.amount).toBeGreaterThanOrEqual(400);
    expect((await economyServerService.lookup(buyer.uuid)).casinoLicenses).toEqual({
      total: 1,
      free: 1,
    });
    await expectLedgerConsistent();
  });

  it('pays from the chosen account, and refuses those who may not spend', async () => {
    const owner = await player();
    const viewer = await player();
    const name = handle();
    const account = await economyServerAccountService.create({
      player: owner.uuid,
      handle: name,
      name: 'Fund',
    });
    await economyServerService.transfer({
      idempotencyKey: randomUUID(),
      from: { player: owner.uuid },
      to: { account: name },
      amount: 500,
    });
    const invitation = await economyServerAccountService.invite(name, {
      player: owner.uuid,
      username: viewer.username,
      role: 'viewer',
    });
    await economyServerAccountService.accept(invitation.id, viewer.uuid);
    await expect(license(viewer.uuid, randomUUID(), name)).rejects.toMatchObject({
      statusCode: 403,
      data: { problem: 'notAllowed' },
    });
    const bought = await license(owner.uuid, randomUUID(), `#${name}`);
    expect(bought.from).toEqual({ accountId: account.id, handle: name, balance: 100 });
    await expect(license(owner.uuid, randomUUID(), name)).rejects.toMatchObject({
      statusCode: 409,
      data: { problem: 'insufficientFunds' },
    });
    // The licence can make that very account a casino.
    const casino = await economyServerAccountService.update(name, {
      player: owner.uuid,
      type: 'casino',
    });
    expect(casino.type).toBe('casino');
    expect((await economyServerService.lookup(owner.uuid)).casinoLicenses).toEqual({
      total: 1,
      free: 0,
    });
  });

  it('refuses a banned player and a frozen account', async () => {
    const admin = await player('Licence Admin');
    const banned = await player();
    const frozen = await player();
    await db.insert(wardenBan).values({ userId: banned.id, reason: 'Cheating', source: 'web' });
    await expect(license(banned.uuid)).rejects.toMatchObject({
      statusCode: 409,
      data: { problem: 'frozen' },
    });
    const personal = (await economyServerService.lookup(frozen.uuid)).defaultAccountId;
    await economyAdminService.freeze(admin.id, personal, { frozen: true, reason: 'Exploit' });
    await expect(license(frozen.uuid)).rejects.toMatchObject({
      statusCode: 409,
      data: { problem: 'frozen' },
    });
    await expect(license(randomUUID())).rejects.toMatchObject({
      statusCode: 404,
      data: { problem: 'notLinked' },
    });
  });

  it('gives a free licence with no transaction, once per key', async () => {
    const admin = await player('Price Admin');
    const buyer = await player();
    const settings = await economySettingsService.update(admin.id, { casinoLicensePrice: 0 });
    expect(settings.casinoLicensePrice).toBe(0);
    const key = randomUUID();
    const bought = await license(buyer.uuid, key);
    expect(bought).toMatchObject({
      transactionId: null,
      replayed: false,
      amount: 0,
      from: { balance: 1000 },
      licenses: { total: 1, free: 1 },
    });
    expect(await license(buyer.uuid, key)).toEqual({ ...bought, replayed: true });
    const rows = await db
      .select()
      .from(economyCasinoLicense)
      .where(eq(economyCasinoLicense.userId, buyer.id));
    expect(rows).toHaveLength(1);
  });
});

describe('mob drops', () => {
  it('mints on the personal account, once per key', async () => {
    const hunter = await player();
    const personal = (await economyServerService.lookup(hunter.uuid)).accounts[0]?.id ?? '';
    const key = randomUUID();
    const body = {
      idempotencyKey: key,
      player: hunter.uuid,
      amount: 35,
      reason: 'mobDrop',
    } as const;
    const minted = await economyServerService.mint(body);
    expect(minted).toMatchObject({
      replayed: false,
      amount: 35,
      to: { accountId: personal, handle: null, balance: 1035 },
    });
    expect(await economyServerService.mint(body)).toEqual({ ...minted, replayed: true });
    await expect(economyServerService.mint({ ...body, amount: 36 })).rejects.toMatchObject({
      statusCode: 409,
      data: { problem: 'idempotencyMismatch' },
    });
    const page = await economyAccountService.transactions(hunter.id, personal, undefined);
    expect(page.items[0]).toMatchObject({
      kind: 'mint',
      reason: 'mobDrop',
      amount: 35,
      counterparty: { type: 'lnb' },
    });
    const stats = await economyStatsService.stats('7d');
    const dropped = stats.reasons.find(
      (row) => row.direction === 'mint' && row.reason === 'mobDrop',
    );
    expect(dropped?.amount).toBeGreaterThanOrEqual(35);
    await expectLedgerConsistent();
  });

  it('goes to the personal account even when another one pays by default', async () => {
    const hunter = await player();
    const name = handle();
    const shared = await economyServerAccountService.create({
      player: hunter.uuid,
      handle: name,
      name: 'Loot',
    });
    await economyServerService.setDefault(hunter.uuid, name);
    const minted = await economyServerService.mint({
      idempotencyKey: randomUUID(),
      player: hunter.uuid,
      amount: 10,
      reason: 'mobDrop',
    });
    expect(minted.to.accountId).not.toBe(shared.id);
    expect(minted.to.balance).toBe(1010);
  });

  it('gives nothing to frozen, banned or unlinked players, and checks the amount', async () => {
    const admin = await player('Drop Admin');
    const banned = await player();
    const frozen = await player();
    const mint = (uuid: string, amount = 5) =>
      economyServerService.mint({
        idempotencyKey: randomUUID(),
        player: uuid,
        amount,
        reason: 'mobDrop',
      });
    await db.insert(wardenBan).values({ userId: banned.id, reason: 'Cheating', source: 'web' });
    await expect(mint(banned.uuid)).rejects.toMatchObject({ data: { problem: 'frozen' } });
    const personal = (await economyServerService.lookup(frozen.uuid)).defaultAccountId;
    await economyAdminService.freeze(admin.id, personal, { frozen: true, reason: 'Exploit' });
    await expect(mint(frozen.uuid)).rejects.toMatchObject({
      statusCode: 409,
      data: { problem: 'frozen' },
    });
    await expect(mint(randomUUID())).rejects.toMatchObject({
      statusCode: 404,
      data: { problem: 'notLinked' },
    });
    await expect(mint(admin.uuid, 0)).rejects.toThrow();
    await expect(mint(admin.uuid, 100_001)).rejects.toThrow();
  });
});

describe('sale notices', () => {
  async function sale() {
    const seller = await player();
    const buyer = await player();
    const listing = await economyAuctionService.create({
      idempotencyKey: randomUUID(),
      player: seller.uuid,
      item: { id: 'minecraft:diamond', snbt: '{id:"minecraft:diamond",count:16}', name: 'Diamond' },
      count: 16,
      price: 200,
    });
    return { seller, buyer, listing };
  }

  it('tells the server who sold, and lists the sale until it is seen', async () => {
    const { seller, buyer, listing } = await sale();
    expect((await economyAuctionService.sales(seller.uuid)).items).toEqual([]);
    const key = randomUUID();
    const bought = await economyAuctionService.buy(listing.id, {
      idempotencyKey: key,
      player: buyer.uuid,
    });
    expect(bought.sellerUserId).toBe(seller.id);
    const replay = await economyAuctionService.buy(listing.id, {
      idempotencyKey: key,
      player: buyer.uuid,
    });
    expect(replay).toMatchObject({ replayed: true, sellerUserId: seller.id });

    const { items } = await economyAuctionService.sales(seller.uuid);
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      listingId: listing.id,
      item: { id: 'minecraft:diamond', name: 'Diamond' },
      count: 16,
      price: 200,
      tax: bought.tax,
      buyer: buyer.username,
    });
    expect(Date.parse(items[0]?.soldAt ?? '')).not.toBeNaN();
    expect((await economyAuctionService.sales(buyer.uuid)).items).toEqual([]);

    // Someone else's ID and an unknown one change nothing.
    await economyAuctionService.salesSeen(buyer.uuid, { listingIds: [listing.id, randomUUID()] });
    expect((await economyAuctionService.sales(seller.uuid)).items).toHaveLength(1);
    await economyAuctionService.salesSeen(seller.uuid, { listingIds: [listing.id] });
    expect((await economyAuctionService.sales(seller.uuid)).items).toEqual([]);
    await economyAuctionService.salesSeen(seller.uuid, { listingIds: [listing.id] });
  });

  it('lists the oldest sales first, and never an unsold listing', async () => {
    const { seller, buyer, listing } = await sale();
    const second = await economyAuctionService.create({
      idempotencyKey: randomUUID(),
      player: seller.uuid,
      item: { id: 'minecraft:emerald', snbt: '{id:"minecraft:emerald"}', name: 'Emerald' },
      count: 1,
      price: 10,
    });
    const unsold = await economyAuctionService.create({
      idempotencyKey: randomUUID(),
      player: seller.uuid,
      item: { id: 'minecraft:dirt', snbt: '{id:"minecraft:dirt"}', name: 'Dirt' },
      count: 1,
      price: 1,
    });
    await economyAuctionService.cancel(unsold.id, {
      idempotencyKey: randomUUID(),
      player: seller.uuid,
    });
    for (const id of [listing.id, second.id]) {
      await economyAuctionService.buy(id, { idempotencyKey: randomUUID(), player: buyer.uuid });
    }
    const { items } = await economyAuctionService.sales(seller.uuid);
    expect(items.map((item) => item.listingId)).toEqual([listing.id, second.id]);
    await expect(economyAuctionService.sales(randomUUID())).rejects.toMatchObject({
      statusCode: 404,
      data: { problem: 'notLinked' },
    });
  });
});

describe('the reset', () => {
  it('clears the licences with the accounts', async () => {
    const admin = await player('Reset Admin');
    const owner = await player();
    await license(owner.uuid);
    await economyAccountService.create(owner.id, {
      name: 'Gone',
      handle: handle(),
      type: 'casino',
    });
    await economyAdminService.reset(admin.id, 'reset the economy');
    expect(await db.select().from(economyCasinoLicense)).toEqual([]);
    expect(await db.select().from(economyAccount)).toEqual([]);
    expect((await economyServerService.lookup(owner.uuid)).casinoLicenses).toEqual({
      total: 0,
      free: 0,
    });
  });
});
