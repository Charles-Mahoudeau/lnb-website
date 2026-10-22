import { randomBytes } from 'node:crypto';

import { db } from '~~/server/db';
import { wardenJoinTicket } from '~~/server/db/schema';
import { createLimiter } from '~~/server/lib/rate-limit';
import type { WardenClient } from '~~/server/utils/warden';

import { wardenDeviceService } from './devices';
import { wardenModerationService } from './moderation';
import { wardenPlayerService } from './players';
import { hashSecret, shortName } from './rules';

import type {
  WardenClientMe,
  WardenJoinTicket,
  WardenJoinTicketBody,
} from '#shared/schemas/warden';

/** A join ticket is good for this long: the time to connect to the server. */
export const JOIN_TICKET_LIFETIME_MS = 60 * 1000;

// Ten tickets a minute per device: joining a server takes one, a retry loop shouldn't take more.
const allowTicket = createLimiter(10, 60);

/** What the mod shows about the signed-in player. */
async function me(client: WardenClient): Promise<WardenClientMe> {
  const { user, device } = client;
  const player = await wardenPlayerService.ensure(db, user.id);
  const accounts = await wardenPlayerService.accounts(db, user.id);
  const ban = await wardenModerationService.activeBan(user.id);
  return {
    user: {
      id: user.id,
      name: user.name,
      shortName: shortName(user.name),
      showRealName: player.showRealName,
    },
    accounts: accounts.map(({ uuid, username, linkedAt, lastSeenAt, online, playtimeSeconds }) => ({
      uuid,
      username,
      linkedAt,
      lastSeenAt,
      online,
      playtimeSeconds,
    })),
    limit: await wardenPlayerService.limit(db, user.id),
    activeBan: ban ? { reason: ban.reason, expiresAt: ban.expiresAt?.toISOString() ?? null } : null,
    device: { id: device.id, name: device.name, expiresAt: device.expiresAt.toISOString() },
  };
}

/** Whether the device may ask for another ticket, else how long to wait. */
function checkTicketRate(deviceId: string) {
  return allowTicket(deviceId);
}

/**
 * A single-use ticket for the Minecraft server, bound to the device, its owner, the nonce, the
 * username and whether to link. Bans and links are decided at login, not here.
 */
async function joinTicket(
  client: WardenClient,
  body: WardenJoinTicketBody,
): Promise<WardenJoinTicket> {
  const ticket = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + JOIN_TICKET_LIFETIME_MS);
  await db.insert(wardenJoinTicket).values({
    ticketHash: hashSecret(ticket),
    deviceId: client.device.id,
    userId: client.user.id,
    nonce: body.nonce,
    username: body.username,
    link: body.link,
    expiresAt,
  });
  return { ticket, expiresAt: expiresAt.toISOString() };
}

/** Signs the calling device out. Its open sessions are kicked on the server. */
async function signOut(client: WardenClient): Promise<void> {
  await wardenDeviceService.revokeOrFail({
    deviceId: client.device.id,
    userId: client.user.id,
    actor: { source: 'web', userId: client.user.id },
  });
}

export const wardenClientService = { me, checkTicketRate, joinTicket, signOut };
