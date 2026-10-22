import { and, desc, eq, gt, isNull } from 'drizzle-orm';

import { db } from '~~/server/db';
import { user, wardenDevice, wardenSession } from '~~/server/db/schema';

import { wardenAuditService } from './audit';
import { DEVICE_LIFETIME_MS, generateDeviceToken, hashSecret, shouldTouchDevice } from './rules';
import type { Db, Tx, WardenActor } from './shared';

import type { WardenDeviceView } from '#shared/schemas/warden';

/** Creates a device and returns its token, which is never stored and can't be shown again. */
async function create(tx: Tx, input: { userId: string; name: string }) {
  const token = generateDeviceToken();
  const [device] = await tx
    .insert(wardenDevice)
    .values({
      userId: input.userId,
      name: input.name,
      tokenHash: hashSecret(token),
      expiresAt: new Date(Date.now() + DEVICE_LIFETIME_MS),
    })
    .returning();
  return { token, device: device! };
}

/**
 * The active device behind a bearer token, with its owner, or undefined when the token is
 * unknown, revoked or expired. Pushes the expiry out, at most once an hour.
 */
async function authenticate(token: string, dbx: Db = db) {
  const [row] = await dbx
    .select({
      device: wardenDevice,
      user: { id: user.id, name: user.name, tenantId: user.tenantId, role: user.role },
    })
    .from(wardenDevice)
    .innerJoin(user, eq(user.id, wardenDevice.userId))
    .where(
      and(
        eq(wardenDevice.tokenHash, hashSecret(token)),
        isNull(wardenDevice.revokedAt),
        gt(wardenDevice.expiresAt, new Date()),
      ),
    );
  if (!row) return undefined;
  if (shouldTouchDevice(row.device.lastUsedAt)) {
    const now = new Date();
    await dbx
      .update(wardenDevice)
      .set({ lastUsedAt: now, expiresAt: new Date(now.getTime() + DEVICE_LIFETIME_MS) })
      .where(eq(wardenDevice.id, row.device.id));
  }
  return row;
}

const active = (now = new Date()) =>
  and(isNull(wardenDevice.revokedAt), gt(wardenDevice.expiresAt, now));

/** The player's active devices, newest first. */
async function list(dbx: Db, userId: string): Promise<WardenDeviceView[]> {
  const rows = await dbx
    .select()
    .from(wardenDevice)
    .where(and(eq(wardenDevice.userId, userId), active()))
    .orderBy(desc(wardenDevice.createdAt));
  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
  }));
}

/**
 * Revokes an active device and returns whether there was one. The UUIDs of its open sessions go
 * in the audit row, which is what the server's `kick` events are made from.
 */
async function revoke(
  tx: Tx,
  input: { deviceId: string; userId: string; actor: WardenActor },
): Promise<boolean> {
  const [device] = await tx
    .update(wardenDevice)
    .set({ revokedAt: new Date() })
    .where(
      and(eq(wardenDevice.id, input.deviceId), eq(wardenDevice.userId, input.userId), active()),
    )
    .returning({ id: wardenDevice.id, name: wardenDevice.name });
  if (!device) return false;
  const sessions = await tx
    .select({ minecraftUuid: wardenSession.minecraftUuid })
    .from(wardenSession)
    .where(and(eq(wardenSession.deviceId, device.id), isNull(wardenSession.endedAt)));
  await wardenAuditService.record(tx, {
    action: 'device.revoke',
    actor: input.actor,
    targetUserId: input.userId,
    data: {
      deviceId: device.id,
      deviceName: device.name,
      uuids: sessions.map((s) => s.minecraftUuid),
    },
  });
  return true;
}

export const wardenDeviceService = { create, authenticate, list, revoke };
