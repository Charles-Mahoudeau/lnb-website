import { randomUUID } from 'node:crypto';

import { and, eq, isNull, sql } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import {
  economyAccount,
  economyEntry,
  economyMember,
  economySettings,
  economyTransaction,
  minecraftAccount,
  user,
  wardenBan,
} from '~~/server/db/schema';
import { offlineUuid } from '~~/server/lib/minecraft';
import { economyAccountService } from '~~/server/services/economy/accounts';
import { economyAdminService } from '~~/server/services/economy/admin';
import { economyServerService } from '~~/server/services/economy/server';
import { economyStatsService } from '~~/server/services/economy/stats';
import { usersService } from '~~/server/services/users';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';

let counter = 0;

/** An Epitech player with a linked Minecraft account. */
async function player(name = 'Eco Tester') {
  const n = ++counter;
  const id = `economy-${String(n)}-${String(Date.now())}`;
  const username = `Eco${String(Date.now() % 100000)}x${String(n)}`.slice(0, 16);
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

async function personalOf(userId: string) {
  return db.transaction((tx) => economyAccountService.ensurePersonal(tx, userId));
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

function pay(from: string, to: { player: string } | { account: string }, amount: number) {
  return economyServerService.transfer({
    idempotencyKey: randomUUID(),
    from: { player: from },
    to,
    amount,
  });
}

beforeEach(async () => {
  await db.update(economySettings).set({ startingBalance: 100 }).where(eq(economySettings.id, 1));
});

afterEach(async () => {
  await db.update(economySettings).set({ startingBalance: 0 }).where(eq(economySettings.id, 1));
});

describe('personal accounts', () => {
  it('opens once, with the starting balance minted on it', async () => {
    const alice = await player();
    const first = await economyServerService.lookup(alice.uuid);
    const again = await economyServerService.lookup(alice.uuid);
    expect(first.accounts).toHaveLength(1);
    expect(again.accounts[0]?.id).toBe(first.accounts[0]?.id);
    expect(first.accounts[0]?.balance).toBe(100);
    const page = await economyAccountService.transactions(
      alice.id,
      first.defaultAccountId,
      undefined,
    );
    expect(page.items).toMatchObject([
      { kind: 'mint', reason: 'startingBalance', amount: 100, counterparty: { type: 'lnb' } },
    ]);
  });

  it('refuses players without a linked Minecraft account', async () => {
    const alice = await player();
    await db
      .update(minecraftAccount)
      .set({ unlinkedAt: new Date() })
      .where(eq(minecraftAccount.userId, alice.id));
    expect((await economyAccountService.me(alice.id)).eligible).toBe(false);
    await expect(economyServerService.lookup(alice.uuid)).rejects.toMatchObject({
      data: { problem: 'notLinked' },
    });
  });
});

describe('transfers', () => {
  it('moves money between players and keeps the ledger balanced', async () => {
    const alice = await player();
    const bob = await player();
    const result = await economyServerService.transfer({
      idempotencyKey: randomUUID(),
      from: { player: alice.uuid },
      to: { player: bob.uuid },
      amount: 30,
      memo: 'for the diamonds',
    });
    expect(result).toMatchObject({ replayed: false, amount: 30 });
    expect(result.from.balance).toBe(70);
    expect(result.to.balance).toBe(130);
    const page = await economyAccountService.transactions(bob.id, result.to.accountId, undefined);
    expect(page.items[0]).toMatchObject({
      kind: 'payment',
      memo: 'for the diamonds',
      amount: 30,
      balanceAfter: 130,
      counterparty: { type: 'player', name: 'Eco T.' },
    });
    await expectLedgerConsistent();
  });

  it('never pays twice for the same key, and refuses the key on another request', async () => {
    const alice = await player();
    const bob = await player();
    const body = {
      idempotencyKey: randomUUID(),
      from: { player: alice.uuid },
      to: { player: bob.uuid },
      amount: 10,
    };
    const first = await economyServerService.transfer(body);
    const second = await economyServerService.transfer(body);
    expect(second).toEqual({ ...first, replayed: true });
    expect(await balanceOf(first.from.accountId)).toBe(90);
    await expect(economyServerService.transfer({ ...body, amount: 11 })).rejects.toMatchObject({
      data: { problem: 'idempotencyMismatch' },
    });
  });

  it('refuses to overdraw, even with transfers at the same time', async () => {
    const alice = await player();
    const bob = await player();
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () => pay(alice.uuid, { player: bob.uuid }, 30)),
    );
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(3);
    const refused = results.find((result) => result.status === 'rejected');
    expect(refused).toMatchObject({ reason: { data: { problem: 'insufficientFunds' } } });
    const { id } = await personalOf(alice.id);
    expect(await balanceOf(id)).toBe(10);
    await expectLedgerConsistent();
  });

  it('freezes the accounts of a banned player, both ways', async () => {
    const alice = await player();
    const bob = await player();
    await personalOf(alice.id);
    await personalOf(bob.id);
    await db.insert(wardenBan).values({ userId: bob.id, reason: 'Griefing', source: 'web' });
    await expect(pay(alice.uuid, { player: bob.uuid }, 5)).rejects.toMatchObject({
      data: { problem: 'frozen' },
    });
    await expect(pay(bob.uuid, { player: alice.uuid }, 5)).rejects.toMatchObject({
      data: { problem: 'frozen' },
    });
  });
});

describe('shared accounts', () => {
  async function casino() {
    const owner = await player('Casino Owner');
    const dealer = await player('Casino Dealer');
    const watcher = await player('Casino Watcher');
    const handle = `casino-${String(++counter)}`;
    const account = await economyAccountService.create(owner.id, { name: 'Casino', handle });
    for (const [who, role] of [
      [dealer, 'member'],
      [watcher, 'viewer'],
    ] as const) {
      await economyAccountService.invite(owner.id, account.id, { username: who.username, role });
      const me = await economyAccountService.me(who.id);
      const invitation = me.invitations.find((row) => row.account.id === account.id);
      await economyAccountService.acceptInvitation(who.id, invitation?.id ?? '');
    }
    return { owner, dealer, watcher, account, handle };
  }

  it('lets members spend and viewers only read', async () => {
    const { owner, dealer, watcher, account, handle } = await casino();
    await pay(owner.uuid, { account: `#${handle}` }, 50);
    const payout = await economyServerService.transfer({
      idempotencyKey: randomUUID(),
      from: { player: dealer.uuid, account: handle },
      to: { player: watcher.uuid },
      amount: 20,
    });
    expect(payout.from.balance).toBe(30);
    await expect(
      economyServerService.transfer({
        idempotencyKey: randomUUID(),
        from: { player: watcher.uuid, account: account.id },
        to: { player: dealer.uuid },
        amount: 1,
      }),
    ).rejects.toMatchObject({ data: { problem: 'notAllowed' } });
    const history = await economyAccountService.transactions(watcher.id, account.id, undefined);
    expect(history.items).toHaveLength(2);
  });

  it('pays out from a casino account without a player', async () => {
    const { owner, watcher, handle } = await casino();
    await pay(owner.uuid, { account: handle }, 40);
    const payout = await economyServerService.transfer({
      idempotencyKey: randomUUID(),
      from: { account: handle },
      to: { player: watcher.uuid },
      amount: 15,
      kind: 'casino',
    });
    expect(payout.from.balance).toBe(25);
  });

  it('refuses a taken or reserved handle', async () => {
    const { owner, handle } = await casino();
    await expect(
      economyAccountService.create(owner.id, { name: 'Copy', handle }),
    ).rejects.toMatchObject({ data: { problem: 'handleTaken' } });
    await expect(
      economyAccountService.create(owner.id, { name: 'Staff', handle: 'staff' }),
    ).rejects.toThrow();
  });

  it('keeps at least one owner', async () => {
    const { owner, account } = await casino();
    await expect(
      economyAccountService.removeMember(owner.id, account.id, owner.id),
    ).rejects.toMatchObject({ data: { problem: 'lastOwner' } });
    await expect(
      economyAccountService.setMemberRole(owner.id, account.id, owner.id, 'member'),
    ).rejects.toMatchObject({ data: { problem: 'lastOwner' } });
  });

  it('falls back to the personal account once the default one is out of reach', async () => {
    const { owner, dealer, account } = await casino();
    await economyAccountService.updateMe(dealer.id, { defaultAccountId: account.id });
    const before = await economyServerService.lookup(dealer.uuid);
    expect(before.defaultAccountId).toBe(account.id);
    await economyAccountService.removeMember(owner.id, account.id, dealer.id);
    const after = await economyServerService.lookup(dealer.uuid);
    expect(after.defaultAccountId).toBe(after.accounts[0]?.id);
  });
});

describe('admins', () => {
  it('reverses a transaction once', async () => {
    const admin = await player('Eco Admin');
    const alice = await player();
    const bob = await player();
    const paid = await pay(alice.uuid, { player: bob.uuid }, 25);
    await economyAdminService.reverse(admin.id, paid.transactionId, 'Scam');
    expect(await balanceOf(paid.from.accountId)).toBe(100);
    expect(await balanceOf(paid.to.accountId)).toBe(100);
    await expect(
      economyAdminService.reverse(admin.id, paid.transactionId, 'Again'),
    ).rejects.toMatchObject({ data: { problem: 'alreadyReversed' } });
    await expectLedgerConsistent();
  });

  it('mints and burns, even on a frozen account', async () => {
    const admin = await player('Eco Admin');
    const alice = await player();
    const { id } = await personalOf(alice.id);
    await economyAdminService.freeze(admin.id, id, { frozen: true, reason: 'Exploit' });
    await economyAdminService.adjust(admin.id, id, {
      direction: 'burn',
      amount: 60,
      reason: 'Dupe',
    });
    const detail = await economyAdminService.adjust(admin.id, id, {
      direction: 'mint',
      amount: 5,
      reason: 'Prize',
    });
    expect(detail).toMatchObject({ balance: 45, frozen: true });
    await expect(
      economyAdminService.adjust(admin.id, id, {
        direction: 'burn',
        amount: 46,
        reason: 'Too much',
      }),
    ).rejects.toMatchObject({ data: { problem: 'insufficientFunds' } });
  });
});

describe('deleted players', () => {
  it('burns their personal account and passes their shared accounts on', async () => {
    const admin = await player('Eco Admin');
    const leaver = await player('Eco Leaver');
    const stayer = await player('Eco Stayer');
    const personal = await personalOf(leaver.id);
    const shared = await economyAccountService.create(leaver.id, {
      name: 'Shop',
      handle: `shop-${String(++counter)}`,
    });
    await economyAccountService.invite(leaver.id, shared.id, {
      username: stayer.username,
      role: 'viewer',
    });
    const invitation = (await economyAccountService.me(stayer.id)).invitations[0];
    await economyAccountService.acceptInvitation(stayer.id, invitation?.id ?? '');

    await db.update(user).set({ role: 'admin' }).where(eq(user.id, admin.id));
    await usersService.remove({ actorId: admin.id, userId: leaver.id });

    const [closed] = await db
      .select()
      .from(economyAccount)
      .where(eq(economyAccount.id, personal.id));
    expect(closed).toMatchObject({ balance: 0, ownerUserId: null });
    expect(closed?.closedAt).not.toBeNull();
    const [burn] = await db
      .select({ reason: economyTransaction.reason })
      .from(economyEntry)
      .innerJoin(economyTransaction, eq(economyTransaction.id, economyEntry.transactionId))
      .where(and(eq(economyEntry.accountId, personal.id), eq(economyTransaction.kind, 'burn')));
    expect(burn?.reason).toBe('accountClosed');
    const members = await db
      .select({ role: economyMember.role })
      .from(economyMember)
      .where(eq(economyMember.accountId, shared.id));
    expect(members).toEqual([{ role: 'owner' }]);
    const open = await db
      .select({ id: economyAccount.id })
      .from(economyAccount)
      .where(
        and(
          isNull(economyAccount.ownerUserId),
          isNull(economyAccount.closedAt),
          eq(economyAccount.kind, 'personal'),
        ),
      );
    expect(open).toEqual([]);
    await expectLedgerConsistent();
  });
});

describe('stats', () => {
  it('adds up the money in circulation and saves closed days', async () => {
    const alice = await player();
    const bob = await player();
    await pay(alice.uuid, { player: bob.uuid }, 7);
    const stats = await economyStatsService.stats('all');
    const [total] = await db
      .select({ supply: sql<string>`coalesce(sum(${economyAccount.balance}), 0)` })
      .from(economyAccount);
    expect(stats.supply).toBe(Number(total?.supply));
    expect(stats.days.at(-1)?.supply).toBe(stats.supply);
    expect(stats.volume.find((row) => row.kind === 'payment')?.count).toBeGreaterThan(0);
    expect(stats.activePlayers).toBeGreaterThan(0);

    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
    expect(await economyStatsService.snapshot(tomorrow)).toBeGreaterThan(0);
    expect(await economyStatsService.snapshot(tomorrow)).toBe(0);
  });
});
