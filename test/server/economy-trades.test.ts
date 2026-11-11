import { randomUUID } from 'node:crypto';

import { eq } from 'drizzle-orm';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import { economySettings, economyTransaction, minecraftAccount, user } from '~~/server/db/schema';
import { offlineUuid } from '~~/server/lib/minecraft';
import { economyAccountService } from '~~/server/services/economy/accounts';
import { economyServerService } from '~~/server/services/economy/server';
import { economyTradeService } from '~~/server/services/economy/trades';

import type { EconomyTradeBody } from '#shared/schemas/economy';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';

let counter = 0;

/** An Epitech player with a linked Minecraft account. */
async function player(name = 'Trade Tester', userId?: string) {
  const n = ++counter;
  const id = userId ?? `economy-trade-${String(n)}-${String(Date.now())}`;
  const username = `Trd${String(Date.now() % 100000)}x${String(n)}`.slice(0, 16);
  const uuid = offlineUuid(username);
  if (!userId)
    await db.insert(user).values({ id, name, email: `${id}@epitech.eu`, tenantId: EPITECH });
  await db.insert(minecraftAccount).values({ uuid, userId: id, username });
  return { id, uuid, username };
}

function trade(body: Partial<EconomyTradeBody> & Pick<EconomyTradeBody, 'from' | 'to'>) {
  return economyTradeService.trade({ idempotencyKey: randomUUID(), amount: 30, ...body });
}

beforeEach(async () => {
  await db.update(economySettings).set({ startingBalance: 100 }).where(eq(economySettings.id, 1));
});

afterEach(async () => {
  await db.update(economySettings).set({ startingBalance: 0 }).where(eq(economySettings.id, 1));
});

describe('trades', () => {
  it('moves the difference between default accounts, once per key', async () => {
    const alice = await player();
    const bob = await player();
    const key = randomUUID();
    const body = { idempotencyKey: key, from: { player: alice.uuid }, to: { player: bob.uuid } };

    const first = await trade(body);
    const again = await trade(body);

    expect(first).toMatchObject({ replayed: false, amount: 30 });
    expect(first.from.balance).toBe(70);
    expect(first.to.balance).toBe(130);
    expect(again).toMatchObject({ replayed: true, transactionId: first.transactionId });
    const [transaction] = await db
      .select()
      .from(economyTransaction)
      .where(eq(economyTransaction.id, first.transactionId));
    expect(transaction?.kind).toBe('trade');
    await expect(trade({ ...body, amount: 31 })).rejects.toMatchObject({
      data: { problem: 'idempotencyMismatch' },
    });
  });

  it('pays into the account the other player chose, if they can spend from it', async () => {
    const alice = await player();
    const bob = await player();
    const watcher = await player();
    const handle = `trade-${String(++counter)}`;
    const shared = await economyAccountService.create(bob.id, { name: 'Bob & co', handle });
    await economyAccountService.invite(bob.id, shared.id, {
      username: watcher.username,
      role: 'viewer',
    });
    const invitation = (await economyAccountService.me(watcher.id)).invitations[0];
    await economyAccountService.acceptInvitation(watcher.id, invitation?.id ?? '');

    const paid = await trade({
      from: { player: alice.uuid },
      to: { player: bob.uuid, account: handle },
    });
    expect(paid.to).toMatchObject({ accountId: shared.id, balance: 30 });

    await expect(
      trade({ from: { player: alice.uuid }, to: { player: watcher.uuid, account: handle } }),
    ).rejects.toMatchObject({ data: { problem: 'notAllowed' } });
  });

  it('refuses a trade between two Minecraft accounts of the same person', async () => {
    const alice = await player();
    const altUuid = (await player('Alt', alice.id)).uuid;
    await economyServerService.lookup(alice.uuid);
    await expect(
      trade({ from: { player: alice.uuid }, to: { player: altUuid } }),
    ).rejects.toMatchObject({ data: { problem: 'sameAccount' } });
  });

  it('refuses to overdraw', async () => {
    const alice = await player();
    const bob = await player();
    await expect(
      trade({ from: { player: alice.uuid }, to: { player: bob.uuid }, amount: 101 }),
    ).rejects.toMatchObject({ data: { problem: 'insufficientFunds' } });
  });
});
