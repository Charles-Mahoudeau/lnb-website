import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import {
  minecraftAccount,
  user,
  wardenAudit,
  wardenDevice,
  wardenSession,
} from '~~/server/db/schema';
import { wardenDeviceService } from '~~/server/services/warden/devices';
import { hashSecret } from '~~/server/services/warden/rules';

const OWNER = 'device-owner';
const OTHER = 'device-other';

beforeAll(async () => {
  for (const id of [OWNER, OTHER]) {
    await db
      .insert(user)
      .values({ id, name: id, email: `${id}@epitech.eu`, tenantId: 't' })
      .onConflictDoNothing();
  }
});

async function newDevice(userId = OWNER) {
  return db.transaction((tx) => wardenDeviceService.create(tx, { userId, name: 'Laptop' }));
}

describe('device tokens', () => {
  it('stores only the hash and finds the device from the token', async () => {
    const { token, device } = await newDevice();
    expect(token).toMatch(/^lnbw_[\w-]{43}$/);
    expect(device.tokenHash).toBe(hashSecret(token));
    expect(device.tokenHash).not.toContain(token);
    const found = await wardenDeviceService.authenticate(token);
    expect(found?.device.id).toBe(device.id);
    expect(found?.user.id).toBe(OWNER);
    expect(await wardenDeviceService.authenticate(`${token}x`)).toBeUndefined();
  });

  it('expires after 90 days without use', async () => {
    const { token, device } = await newDevice();
    const days = (n: number) => new Date(Date.now() + n * 86_400_000);
    expect(device.expiresAt.getTime()).toBeGreaterThan(days(89).getTime());
    expect(device.expiresAt.getTime()).toBeLessThan(days(91).getTime());
    await db
      .update(wardenDevice)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(wardenDevice.id, device.id));
    expect(await wardenDeviceService.authenticate(token)).toBeUndefined();
  });

  it('slides the expiry at most once an hour', async () => {
    const { token, device } = await newDevice();
    await wardenDeviceService.authenticate(token);
    const [fresh] = await db.select().from(wardenDevice).where(eq(wardenDevice.id, device.id));
    expect(fresh!.lastUsedAt).toEqual(device.lastUsedAt);

    const old = new Date(Date.now() - 2 * 3_600_000);
    await db
      .update(wardenDevice)
      .set({ lastUsedAt: old, expiresAt: new Date(Date.now() + 86_400_000) })
      .where(eq(wardenDevice.id, device.id));
    await wardenDeviceService.authenticate(token);
    const [touched] = await db.select().from(wardenDevice).where(eq(wardenDevice.id, device.id));
    expect(touched!.lastUsedAt.getTime()).toBeGreaterThan(old.getTime());
    expect(touched!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 89 * 86_400_000);
  });

  it('refuses a revoked device and lists active ones only', async () => {
    const { token, device } = await newDevice();
    const actor = { source: 'web', userId: OWNER } as const;
    // Someone else can't revoke it.
    expect(
      await db.transaction((tx) =>
        wardenDeviceService.revoke(tx, { deviceId: device.id, userId: OTHER, actor }),
      ),
    ).toBe(false);
    expect(
      await db.transaction((tx) =>
        wardenDeviceService.revoke(tx, { deviceId: device.id, userId: OWNER, actor }),
      ),
    ).toBe(true);
    expect(await wardenDeviceService.authenticate(token)).toBeUndefined();
    const listed = await wardenDeviceService.list(db, OWNER);
    expect(listed.map((d) => d.id)).not.toContain(device.id);
    const [audit] = await db
      .select()
      .from(wardenAudit)
      .where(eq(wardenAudit.action, 'device.revoke'));
    expect(audit?.targetUserId).toBe(OWNER);
  });

  it('lists the open sessions of the revoked device in the audit row', async () => {
    const { device } = await newDevice();
    const uuid = '22222222-2222-4222-8222-222222222222';
    await db
      .insert(minecraftAccount)
      .values({ uuid, userId: OWNER, username: 'Dev' })
      .onConflictDoNothing();
    await db
      .insert(wardenSession)
      .values({ minecraftUuid: uuid, userId: OWNER, deviceId: device.id });
    await db.transaction((tx) =>
      wardenDeviceService.revoke(tx, {
        deviceId: device.id,
        userId: OWNER,
        actor: { source: 'web', userId: OWNER },
      }),
    );
    const rows = await db.select().from(wardenAudit).where(eq(wardenAudit.action, 'device.revoke'));
    const mine = rows.find((r) => (r.data as { deviceId?: string }).deviceId === device.id);
    expect((mine!.data as { uuids: string[] }).uuids).toEqual([uuid]);
  });
});
