import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import {
  minecraftAccount,
  user,
  wardenJoinTicket,
  wardenPresence,
  wardenSession,
} from '~~/server/db/schema';
import { wardenClientService } from '~~/server/services/warden/client';
import { wardenDeviceService } from '~~/server/services/warden/devices';
import { wardenEventService } from '~~/server/services/warden/events';
import { wardenPresenceService } from '~~/server/services/warden/presence';
import { hashSecret } from '~~/server/services/warden/rules';
import type { WardenClient } from '~~/server/utils/warden';

const OWNER = 'client-owner';
const NONCE = 'A'.repeat(43);

beforeAll(async () => {
  await db
    .insert(user)
    .values({ id: OWNER, name: 'Client Owner', email: 'client-owner@epitech.eu', tenantId: 't' })
    .onConflictDoNothing();
});

async function newClient(name = 'Laptop'): Promise<WardenClient> {
  const { device } = await db.transaction((tx) =>
    wardenDeviceService.create(tx, { userId: OWNER, name }),
  );
  return {
    device: { id: device.id, name: device.name, expiresAt: device.expiresAt },
    user: { id: OWNER, name: 'Client Owner', tenantId: 't', role: null },
  };
}

describe('GET /client/me', () => {
  it('describes the player, their limit and the calling device', async () => {
    const client = await newClient('Desk');
    const me = await wardenClientService.me(client);
    expect(me.user).toEqual({
      id: OWNER,
      name: 'Client Owner',
      shortName: 'Client O.',
      showRealName: true,
    });
    expect(me.limit.max).toBeGreaterThanOrEqual(1);
    expect(me.activeBan).toBeNull();
    expect(me.device).toMatchObject({ id: client.device.id, name: 'Desk' });
  });
});

describe('join tickets', () => {
  it('binds the ticket to the device, owner, nonce, username and link, and stores a hash', async () => {
    const client = await newClient();
    const { ticket, expiresAt } = await wardenClientService.joinTicket(client, {
      nonce: NONCE,
      username: 'Steve',
      link: true,
    });
    const [row] = await db
      .select()
      .from(wardenJoinTicket)
      .where(eq(wardenJoinTicket.ticketHash, hashSecret(ticket)));
    expect(row).toMatchObject({
      deviceId: client.device.id,
      userId: OWNER,
      nonce: NONCE,
      username: 'Steve',
      link: true,
      usedAt: null,
    });
    expect(row!.ticketHash).not.toBe(ticket);
    const seconds = (new Date(expiresAt).getTime() - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(55);
    expect(seconds).toBeLessThanOrEqual(60);
  });

  it('allows ten tickets a minute per device', async () => {
    const client = await newClient();
    for (let i = 0; i < 10; i++) {
      expect(await wardenClientService.checkTicketRate(client.device.id)).toEqual({
        allowed: true,
      });
    }
    expect(await wardenClientService.checkTicketRate(client.device.id)).toMatchObject({
      allowed: false,
    });
    // Another device has its own count.
    const other = await newClient();
    expect(await wardenClientService.checkTicketRate(other.device.id)).toEqual({ allowed: true });
  });
});

describe('presence', () => {
  it('holds for three minutes and can be cleared', async () => {
    const client = await newClient();
    await wardenPresenceService.set({ deviceId: client.device.id, userId: OWNER });
    expect((await wardenPresenceService.ofUsers([OWNER])).get(OWNER)).toBe('menu');

    await db
      .update(wardenPresence)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(wardenPresence.deviceId, client.device.id));
    expect((await wardenPresenceService.ofUsers([OWNER])).get(OWNER)).toBe('offline');

    await wardenPresenceService.set({ deviceId: client.device.id, userId: OWNER });
    const [row] = await db
      .select()
      .from(wardenPresence)
      .where(eq(wardenPresence.deviceId, client.device.id));
    const seconds = (row!.expiresAt.getTime() - Date.now()) / 1000;
    expect(seconds).toBeGreaterThan(170);
    expect(seconds).toBeLessThanOrEqual(180);

    await wardenPresenceService.clear(client.device.id);
    expect((await wardenPresenceService.ofUsers([OWNER])).get(OWNER)).toBe('offline');
  });

  it('puts a player on the server before the menu', async () => {
    const client = await newClient();
    const uuid = '33333333-3333-4333-8333-333333333333';
    await db
      .insert(minecraftAccount)
      .values({ uuid, userId: OWNER, username: 'Presence' })
      .onConflictDoNothing();
    await wardenPresenceService.set({ deviceId: client.device.id, userId: OWNER });
    const [session] = await db
      .insert(wardenSession)
      .values({ minecraftUuid: uuid, userId: OWNER, deviceId: client.device.id })
      .returning();
    expect((await wardenPresenceService.ofUsers([OWNER])).get(OWNER)).toBe('server');
    await db
      .update(wardenSession)
      .set({ endedAt: new Date() })
      .where(eq(wardenSession.id, session!.id));
    expect((await wardenPresenceService.ofUsers([OWNER])).get(OWNER)).toBe('menu');
  });
});

describe('revoking a device', () => {
  it('emits a kick event for the device’s open sessions, with the reason deviceRevoked', async () => {
    const client = await newClient();
    const uuid = '44444444-4444-4444-8444-444444444444';
    await db
      .insert(minecraftAccount)
      .values({ uuid, userId: OWNER, username: 'Kicked' })
      .onConflictDoNothing();
    await db
      .insert(wardenSession)
      .values({ minecraftUuid: uuid, userId: OWNER, deviceId: client.device.id });
    const before = await wardenEventService.latestId();

    await wardenClientService.signOut(client);

    const events = await wardenEventService.since(before);
    expect(events.map((e) => e.event)).toEqual([
      { type: 'kick', data: { uuids: [uuid], reason: 'deviceRevoked' } },
    ]);
    // Signing out twice finds no active device.
    await expect(wardenClientService.signOut(client)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('sends no event when the device had no open session', async () => {
    const client = await newClient();
    const before = await wardenEventService.latestId();
    await wardenClientService.signOut(client);
    expect(await wardenEventService.since(before)).toEqual([]);
  });
});
