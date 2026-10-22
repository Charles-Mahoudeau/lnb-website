import { and, eq, gt, inArray, isNull } from 'drizzle-orm';

import { db } from '~~/server/db';
import { wardenPresence, wardenSession } from '~~/server/db/schema';

import { isOnline } from './rules';
import type { Db } from './shared';

/** A device in the menu counts for this long after its last PUT. */
export const PRESENCE_TTL_MS = 3 * 60 * 1000;

export type WardenPresenceState = 'server' | 'menu' | 'offline';

/** Marks the device as in the Minecraft menu. The mod sends it again to keep it. */
async function set(input: { deviceId: string; userId: string }): Promise<void> {
  const expiresAt = new Date(Date.now() + PRESENCE_TTL_MS);
  await db
    .insert(wardenPresence)
    .values({ deviceId: input.deviceId, userId: input.userId, expiresAt })
    .onConflictDoUpdate({ target: wardenPresence.deviceId, set: { expiresAt } });
}

async function clear(deviceId: string): Promise<void> {
  await db.delete(wardenPresence).where(eq(wardenPresence.deviceId, deviceId));
}

/**
 * Where each player is: on the server, in the menu of the mod, or neither. A player on the
 * server counts as on the server even when a device of theirs sits in the menu.
 */
async function ofUsers(userIds: string[], dbx: Db = db): Promise<Map<string, WardenPresenceState>> {
  const states = new Map<string, WardenPresenceState>(userIds.map((id) => [id, 'offline']));
  if (userIds.length === 0) return states;
  const menu = await dbx
    .select({ userId: wardenPresence.userId })
    .from(wardenPresence)
    .where(and(inArray(wardenPresence.userId, userIds), gt(wardenPresence.expiresAt, new Date())));
  for (const row of menu) states.set(row.userId, 'menu');
  const open = await dbx
    .select({
      userId: wardenSession.userId,
      endedAt: wardenSession.endedAt,
      lastHeartbeatAt: wardenSession.lastHeartbeatAt,
    })
    .from(wardenSession)
    .where(and(inArray(wardenSession.userId, userIds), isNull(wardenSession.endedAt)));
  const now = Date.now();
  for (const session of open) if (isOnline(session, now)) states.set(session.userId, 'server');
  return states;
}

export const wardenPresenceService = { set, clear, ofUsers };
