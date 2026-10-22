import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import {
  minecraftAccount,
  user,
  wardenAccountTransfer,
  wardenAudit,
  wardenSession,
} from '~~/server/db/schema';
import { offlineUuid } from '~~/server/lib/minecraft';
import { wardenClientService } from '~~/server/services/warden/client';
import { wardenDeviceService } from '~~/server/services/warden/devices';
import { wardenPlayerService } from '~~/server/services/warden/players';
import { wardenSessionService } from '~~/server/services/warden/sessions';
import type { WardenClient } from '~~/server/utils/warden';

import type { WardenLogin } from '#shared/schemas/warden';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const NONCE = 'N'.repeat(43);

let counter = 0;

async function player() {
  const id = `transfer-${String(++counter)}-${String(Date.now())}`;
  await db
    .insert(user)
    .values({ id, name: 'Transfer Tester', email: `${id}@epitech.eu`, tenantId: EPITECH });
  const { device } = await db.transaction((tx) =>
    wardenDeviceService.create(tx, { userId: id, name: 'Laptop' }),
  );
  const client: WardenClient = {
    device: { id: device.id, name: device.name, expiresAt: device.expiresAt },
    user: { id, name: 'Transfer Tester', tenantId: EPITECH, role: null },
  };
  return { id, client };
}

let names = 0;
function freshName() {
  return `Tr${String(Date.now() % 100000)}x${String(++names)}`.slice(0, 16);
}

/** Logs the player in as `username`, linking the account when asked to. */
async function join(client: WardenClient, username: string, link: boolean) {
  const { ticket } = await wardenClientService.joinTicket(client, {
    nonce: NONCE,
    username,
    link,
  });
  return wardenSessionService.login({
    ticket,
    nonce: NONCE,
    uuid: offlineUuid(username),
    username,
  });
}

function denied(result: WardenLogin) {
  if (result.result !== 'denied') throw new Error('expected a denial');
  return result;
}

function unlink(userId: string, username: string) {
  return wardenPlayerService.unlink({
    userId,
    uuid: offlineUuid(username),
    actor: { source: 'web', userId },
  });
}

async function account(username: string) {
  const [row] = await db
    .select()
    .from(minecraftAccount)
    .where(eq(minecraftAccount.uuid, offlineUuid(username)));
  return row;
}

/** A player who linked `username`, played a bit, and unlinked it. */
async function unlinkedAccount() {
  const owner = await player();
  const username = freshName();
  const linked = await join(owner.client, username, true);
  expect(linked.result).toBe('allowed');
  await db
    .update(minecraftAccount)
    .set({ playtimeSeconds: 3600 })
    .where(eq(minecraftAccount.uuid, offlineUuid(username)));
  await unlink(owner.id, username);
  return { owner, username };
}

describe('unlinking', () => {
  it('keeps the account, its sessions and its playtime', async () => {
    const { owner, username } = await unlinkedAccount();
    const row = await account(username);
    expect(row?.userId).toBe(owner.id);
    expect(row?.unlinkedAt).toBeInstanceOf(Date);
    expect(row?.playtimeSeconds).toBe(3600);
    const sessions = await db
      .select()
      .from(wardenSession)
      .where(eq(wardenSession.minecraftUuid, offlineUuid(username)));
    expect(sessions).toHaveLength(1);
  });

  it('leaves the list of accounts and frees the slot, but keeps the playtime in the total', async () => {
    const { owner } = await unlinkedAccount();
    expect(await wardenPlayerService.accounts(db, owner.id)).toEqual([]);
    expect((await wardenPlayerService.limit(db, owner.id)).used).toBe(0);
    expect(await wardenPlayerService.totalPlaytime(db, owner.id)).toBe(3600);
  });

  it('refuses to unlink an account twice', async () => {
    const { owner, username } = await unlinkedAccount();
    await expect(unlink(owner.id, username)).rejects.toMatchObject({ statusCode: 404 });
  });
});

describe('linking an unlinked account again', () => {
  it('keeps the history for the same player, without a warning', async () => {
    const { owner, username } = await unlinkedAccount();
    const result = await join(owner.client, username, true);
    expect(result).toMatchObject({ result: 'allowed', linked: true });
    const row = await account(username);
    expect(row?.unlinkedAt).toBeNull();
    expect(row?.playtimeSeconds).toBe(3600);
    const transfers = await db
      .select()
      .from(wardenAccountTransfer)
      .where(eq(wardenAccountTransfer.minecraftUuid, offlineUuid(username)));
    expect(transfers).toEqual([]);
  });

  it('needs the player to agree to link', async () => {
    const { owner, username } = await unlinkedAccount();
    expect(denied(await join(owner.client, username, false)).reason).toBe('notLinked');
    const other = await player();
    expect(denied(await join(other.client, username, false)).reason).toBe('notLinked');
    expect((await account(username))?.userId).toBe(owner.id);
  });
});

describe('taking over an unlinked account', () => {
  it('moves it to the new player at no playtime, and keeps the previous owner’s history', async () => {
    const { owner, username } = await unlinkedAccount();
    const taker = await player();
    const result = await join(taker.client, username, true);
    expect(result).toMatchObject({ result: 'allowed', linked: true });

    const row = await account(username);
    expect(row).toMatchObject({ userId: taker.id, playtimeSeconds: 0, unlinkedAt: null });

    // The sessions stay with the previous owner, who keeps the playtime in their total.
    const sessions = await db
      .select()
      .from(wardenSession)
      .where(eq(wardenSession.minecraftUuid, offlineUuid(username)));
    expect(sessions.some((s) => s.userId === owner.id)).toBe(true);
    expect(await wardenPlayerService.totalPlaytime(db, owner.id)).toBe(3600);
    expect(await wardenPlayerService.totalPlaytime(db, taker.id)).toBe(0);
    expect(await wardenPlayerService.accounts(db, owner.id)).toEqual([]);
    expect(await wardenPlayerService.accounts(db, taker.id)).toHaveLength(1);
  });

  it('records the transfer and audits it', async () => {
    const { owner, username } = await unlinkedAccount();
    const taker = await player();
    await join(taker.client, username, true);

    const [transfer] = await db
      .select()
      .from(wardenAccountTransfer)
      .where(eq(wardenAccountTransfer.minecraftUuid, offlineUuid(username)));
    expect(transfer).toMatchObject({
      fromUserId: owner.id,
      toUserId: taker.id,
      username,
      dismissedAt: null,
    });
    const [entry] = await db
      .select()
      .from(wardenAudit)
      .where(and(eq(wardenAudit.action, 'link.transfer'), eq(wardenAudit.targetUserId, taker.id)));
    expect(entry?.data).toMatchObject({ fromUserId: owner.id, transferId: transfer!.id });
  });

  it('counts against the new player’s limit', async () => {
    const { username } = await unlinkedAccount();
    const taker = await player();
    expect((await join(taker.client, freshName(), true)).result).toBe('allowed');
    expect(denied(await join(taker.client, username, true)).reason).toBe('accountLimitReached');
    expect((await account(username))?.unlinkedAt).toBeInstanceOf(Date);
  });

  it('is refused while the account is linked', async () => {
    const owner = await player();
    const username = freshName();
    await join(owner.client, username, true);
    const taker = await player();
    expect(denied(await join(taker.client, username, true)).reason).toBe('linkedElsewhere');
  });

  it('lets two logins at once take it over only once', async () => {
    const { username } = await unlinkedAccount();
    const [a, b] = await Promise.all([player(), player()]);
    const results = await Promise.all([
      join(a.client, username, true),
      join(b.client, username, true),
    ]);
    expect(results.filter((r) => r.result === 'allowed')).toHaveLength(1);
    const transfers = await db
      .select()
      .from(wardenAccountTransfer)
      .where(eq(wardenAccountTransfer.minecraftUuid, offlineUuid(username)));
    expect(transfers).toHaveLength(1);
  });
});
