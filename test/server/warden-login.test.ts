import { and, eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import {
  minecraftAccount,
  user,
  wardenAudit,
  wardenBan,
  wardenDevice,
  wardenJoinTicket,
  wardenSession,
} from '~~/server/db/schema';
import { offlineUuid } from '~~/server/lib/minecraft';
import { wardenClientService } from '~~/server/services/warden/client';
import { wardenDeviceService } from '~~/server/services/warden/devices';
import { hashSecret } from '~~/server/services/warden/rules';
import { wardenSessionService } from '~~/server/services/warden/sessions';
import type { WardenClient } from '~~/server/utils/warden';

import type { WardenLogin } from '#shared/schemas/warden';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';
const NONCE = 'N'.repeat(43);

let counter = 0;

/** A player with a device, on a fresh account. */
async function player(tenantId = EPITECH) {
  const id = `login-${String(++counter)}-${String(Date.now())}`;
  await db.insert(user).values({ id, name: 'Login Tester', email: `${id}@epitech.eu`, tenantId });
  const { device } = await db.transaction((tx) =>
    wardenDeviceService.create(tx, { userId: id, name: 'Laptop' }),
  );
  const client: WardenClient = {
    device: { id: device.id, name: device.name, expiresAt: device.expiresAt },
    user: { id, name: 'Login Tester', tenantId, role: null },
  };
  return { id, client };
}

const names = new Map<string, number>();
/** A username nobody uses yet, so accounts of different tests never meet. */
function freshName(prefix = 'Tester') {
  const next = (names.get(prefix) ?? 0) + 1;
  names.set(prefix, next);
  return `${prefix}${String(Date.now() % 100000)}x${String(next)}`.slice(0, 16);
}

async function join(
  client: WardenClient,
  options: { username?: string; link?: boolean; nonce?: string } = {},
) {
  const username = options.username ?? freshName();
  const { ticket } = await wardenClientService.joinTicket(client, {
    nonce: options.nonce ?? NONCE,
    username,
    link: options.link ?? false,
  });
  return { ticket, username };
}

function login(body: { ticket: string; username: string; nonce?: string; uuid?: string }) {
  return wardenSessionService.login({
    ticket: body.ticket,
    nonce: body.nonce ?? NONCE,
    uuid: body.uuid ?? offlineUuid(body.username),
    username: body.username,
  });
}

function denied(result: WardenLogin) {
  if (result.result !== 'denied') throw new Error('expected a denial');
  return result;
}

describe('login: the offline UUID', () => {
  it('refuses a UUID that is not the offline UUID of the username', async () => {
    const { client } = await player();
    const { ticket, username } = await join(client);
    await expect(
      login({ ticket, username, uuid: offlineUuid(username.toLowerCase() + 'x') }),
    ).rejects.toMatchObject({ statusCode: 400, data: { problem: 'invalidUuid' } });
    // The ticket was not used up by that mistake.
    expect((await login({ ticket, username })).result).toBe('denied');
  });

  it('is case-sensitive', async () => {
    const { client } = await player();
    const { ticket } = await join(client, { username: 'CaseTest' });
    await expect(
      login({ ticket, username: 'CaseTest', uuid: offlineUuid('casetest') }),
    ).rejects.toMatchObject({ statusCode: 400 });
  });
});

describe('login: tickets', () => {
  it('denies an unknown ticket', async () => {
    const username = freshName();
    expect(denied(await login({ ticket: 'nope', username })).reason).toBe('invalidTicket');
  });

  it('uses a ticket once', async () => {
    const { client } = await player();
    const { ticket, username } = await join(client, { link: true });
    expect((await login({ ticket, username })).result).toBe('allowed');
    expect(denied(await login({ ticket, username })).reason).toBe('invalidTicket');
  });

  it('uses the ticket up even when the login is denied', async () => {
    const { client } = await player();
    const { ticket, username } = await join(client, { link: false });
    expect(denied(await login({ ticket, username })).reason).toBe('notLinked');
    const [row] = await db
      .select()
      .from(wardenJoinTicket)
      .where(eq(wardenJoinTicket.ticketHash, hashSecret(ticket)));
    expect(row?.usedAt).not.toBeNull();
    expect(denied(await login({ ticket, username })).reason).toBe('invalidTicket');
  });

  it('denies an expired ticket', async () => {
    const { client } = await player();
    const { ticket, username } = await join(client, { link: true });
    await db
      .update(wardenJoinTicket)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(wardenJoinTicket.ticketHash, hashSecret(ticket)));
    expect(denied(await login({ ticket, username })).reason).toBe('invalidTicket');
  });

  it('denies another nonce or another username', async () => {
    const { client } = await player();
    const first = await join(client, { link: true });
    expect(
      denied(await login({ ticket: first.ticket, username: first.username, nonce: 'M'.repeat(43) }))
        .reason,
    ).toBe('invalidTicket');
    const second = await join(client, { link: true });
    const other = freshName('Other');
    expect(denied(await login({ ticket: second.ticket, username: other })).reason).toBe(
      'invalidTicket',
    );
    // Case counts too.
    const third = await join(client, { link: true, username: 'Mixed_Case' });
    expect(denied(await login({ ticket: third.ticket, username: 'mixed_case' })).reason).toBe(
      'invalidTicket',
    );
  });

  it('denies a ticket whose device was revoked or expired', async () => {
    const revoked = await player();
    const a = await join(revoked.client, { link: true });
    await db
      .update(wardenDevice)
      .set({ revokedAt: new Date() })
      .where(eq(wardenDevice.id, revoked.client.device.id));
    expect(denied(await login(a)).reason).toBe('invalidTicket');

    const expired = await player();
    const b = await join(expired.client, { link: true });
    await db
      .update(wardenDevice)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(wardenDevice.id, expired.client.device.id));
    expect(denied(await login(b)).reason).toBe('invalidTicket');
  });
});

describe('login: the checks, in order', () => {
  it('checks the school after the ticket', async () => {
    const { client } = await player('some-other-school');
    const { ticket, username } = await join(client, { link: true });
    expect(denied(await login({ ticket, username })).reason).toBe('schoolNotAllowed');
    expect(
      await db.select().from(minecraftAccount).where(eq(minecraftAccount.username, username)),
    ).toEqual([]);
  });

  it('checks bans before linking', async () => {
    const { id, client } = await player();
    await db.insert(wardenBan).values({ userId: id, reason: 'Griefing', source: 'web' });
    const { ticket, username } = await join(client, { link: true });
    const result = denied(await login({ ticket, username }));
    expect(result.reason).toBe('banned');
    expect(result.ban).toMatchObject({ reason: 'Griefing', expiresAt: null });
    // The account was not linked.
    expect(
      await db
        .select()
        .from(minecraftAccount)
        .where(eq(minecraftAccount.uuid, offlineUuid(username))),
    ).toEqual([]);
  });

  it('checks bans before an account linked elsewhere', async () => {
    const owner = await player();
    const username = freshName();
    await login({ ...(await join(owner.client, { username, link: true })), username });
    const other = await player();
    await db.insert(wardenBan).values({ userId: other.id, reason: 'Spam', source: 'web' });
    const { ticket } = await join(other.client, { username, link: true });
    expect(denied(await login({ ticket, username })).reason).toBe('banned');
  });

  it('denies an account linked to another LNB account, even with link:true', async () => {
    const owner = await player();
    const username = freshName();
    const first = await join(owner.client, { username, link: true });
    expect((await login(first)).result).toBe('allowed');

    const other = await player();
    const second = await join(other.client, { username, link: true });
    expect(denied(await login(second)).reason).toBe('linkedElsewhere');
  });

  it('denies an unlinked account when the player did not agree to link, with the limit', async () => {
    const { client } = await player();
    const { ticket, username } = await join(client, { link: false });
    const result = denied(await login({ ticket, username }));
    expect(result.reason).toBe('notLinked');
    expect(result.limit).toEqual({ used: 0, max: 1 });
  });

  it('denies linking beyond the limit', async () => {
    const { client } = await player();
    const first = await join(client, { link: true });
    expect((await login(first)).result).toBe('allowed');
    const second = await join(client, { link: true });
    const result = denied(await login(second));
    expect(result.reason).toBe('accountLimitReached');
    expect(result.limit).toEqual({ used: 1, max: 1 });
    expect(
      await db
        .select()
        .from(minecraftAccount)
        .where(eq(minecraftAccount.uuid, offlineUuid(second.username))),
    ).toEqual([]);
  });

  it('lets two logins at once link only one account', async () => {
    const { client } = await player();
    const a = await join(client, { link: true });
    const b = await join(client, { link: true });
    const results = await Promise.all([login(a), login(b)]);
    expect(results.map((r) => r.result).sort()).toEqual(['allowed', 'denied']);
  });
});

describe('login: allowed', () => {
  it('links with link:true, audits it, and opens a session for the device', async () => {
    const { id, client } = await player();
    const { ticket, username } = await join(client, { link: true });
    const result = await login({ ticket, username });
    expect(result).toMatchObject({
      result: 'allowed',
      linked: true,
      account: { uuid: offlineUuid(username), username },
      player: { userId: id, displayName: 'Login T.', roles: [] },
      warnings: [],
    });
    if (result.result !== 'allowed') return;

    const [account] = await db
      .select()
      .from(minecraftAccount)
      .where(eq(minecraftAccount.uuid, offlineUuid(username)));
    expect(account?.userId).toBe(id);
    const [session] = await db
      .select()
      .from(wardenSession)
      .where(eq(wardenSession.id, result.sessionId));
    expect(session).toMatchObject({ userId: id, deviceId: client.device.id, endedAt: null });
    const [audit] = await db
      .select()
      .from(wardenAudit)
      .where(
        and(
          eq(wardenAudit.action, 'link'),
          eq(wardenAudit.targetMinecraftUuid, offlineUuid(username)),
        ),
      );
    expect(audit).toMatchObject({ source: 'minecraft', targetUserId: id });
  });

  it('does not link twice: a linked account logs in with linked:false', async () => {
    const { client } = await player();
    const username = freshName();
    expect(await login(await join(client, { username, link: true }))).toMatchObject({
      linked: true,
    });
    const again = await login(await join(client, { username, link: true }));
    expect(again).toMatchObject({ result: 'allowed', linked: false });
    const withoutLink = await login(await join(client, { username, link: false }));
    expect(withoutLink).toMatchObject({ result: 'allowed', linked: false });
  });

  it('ends the account’s earlier open session', async () => {
    const { client } = await player();
    const username = freshName();
    const first = await login(await join(client, { username, link: true }));
    const second = await login(await join(client, { username }));
    if (first.result !== 'allowed' || second.result !== 'allowed') throw new Error('allowed');
    const [old] = await db
      .select()
      .from(wardenSession)
      .where(eq(wardenSession.id, first.sessionId));
    expect(old?.endedAt).not.toBeNull();
  });
});
