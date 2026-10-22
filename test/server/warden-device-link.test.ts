import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import { deviceCode, user, wardenAudit, wardenDevice } from '~~/server/db/schema';
import { wardenDeviceLinkService } from '~~/server/services/warden/device-links';

const OWNER = 'link-owner';

beforeAll(async () => {
  process.env.WARDEN_SERVER_SECRET = 'x'.repeat(40);
  process.env.WARDEN_SERVER_HOST = 'mc.example.com';
  process.env.BETTER_AUTH_URL = 'https://lnb.example.com';
  await db
    .insert(user)
    .values({ id: OWNER, name: 'Link Owner', email: 'link-owner@epitech.eu', tenantId: 't' })
    .onConflictDoNothing();
});

async function request(deviceName = 'Laptop') {
  const created = await wardenDeviceLinkService.create({ deviceName });
  const [code] = await db
    .select()
    .from(deviceCode)
    .where(eq(deviceCode.userCode, created.userCode));
  return { created, code: code! };
}

/** What GET /api/auth/device does when the person enters the code on /link. */
async function claim(codeId: string) {
  await db.update(deviceCode).set({ userId: OWNER }).where(eq(deviceCode.id, codeId));
}

/** Lets the next poll through, as if `interval` seconds had passed. */
async function wait(codeId: string) {
  await db
    .update(deviceCode)
    .set({ lastPolledAt: new Date(Date.now() - 10_000) })
    .where(eq(deviceCode.id, codeId));
}

function decide(codeId: string, decision: 'approved' | 'denied') {
  return db.transaction((tx) =>
    wardenDeviceLinkService.decide(tx, { actorId: OWNER, deviceCodeId: codeId, decision }),
  );
}

describe('device link requests', () => {
  it('gives a 6-digit code valid for 10 minutes and a secret', async () => {
    const { created, code } = await request();
    expect(created.userCode).toMatch(/^\d{6}$/);
    expect(created.pollSecret.length).toBeGreaterThan(30);
    expect(created.interval).toBe(5);
    expect(created.expiresIn).toBe(600);
    expect(created.verificationUriComplete).toBe(
      `https://lnb.example.com/link?code=${created.userCode}`,
    );
    expect(code.clientId).toBe('warden');
    expect(code.status).toBe('pending');
  });

  it('previews the device to the person who claimed the code', async () => {
    const { created, code } = await request('Desktop');
    expect(
      await wardenDeviceLinkService.preview({ actorId: OWNER, userCode: created.userCode }),
    ).toBe(undefined);
    await claim(code.id);
    expect(
      await wardenDeviceLinkService.preview({ actorId: OWNER, userCode: created.userCode }),
    ).toEqual({ kind: 'device', deviceName: 'Desktop' });
  });

  it('hands the token over once after approval', async () => {
    const { created, code } = await request();
    expect(await wardenDeviceLinkService.poll(created.requestId, created.pollSecret)).toEqual({
      status: 'pending',
    });
    await claim(code.id);
    expect(await decide(code.id, 'approved')).toEqual({ handled: true });

    await wait(code.id);
    const approved = await wardenDeviceLinkService.poll(created.requestId, created.pollSecret);
    expect(approved).toMatchObject({
      status: 'approved',
      token: expect.stringMatching(/^lnbw_/) as string,
      user: { id: OWNER, name: 'Link Owner' },
    });
    const devices = await db.select().from(wardenDevice).where(eq(wardenDevice.userId, OWNER));
    expect(devices.filter((d) => d.name === 'Laptop')).toHaveLength(1);

    await wait(code.id);
    expect(await wardenDeviceLinkService.poll(created.requestId, created.pollSecret)).toEqual({
      status: 'expired',
    });
    const audit = await db.select().from(wardenAudit).where(eq(wardenAudit.action, 'device.link'));
    expect(
      audit.some((a) => (a.data as { requestId?: string }).requestId === created.requestId),
    ).toBe(true);
  });

  it('creates one device when two polls race', async () => {
    const { created, code } = await request('Racer');
    await claim(code.id);
    await decide(code.id, 'approved');
    await wait(code.id);
    const results = await Promise.allSettled([
      wardenDeviceLinkService.poll(created.requestId, created.pollSecret),
      wardenDeviceLinkService.poll(created.requestId, created.pollSecret),
    ]);
    const statuses = results.map((r) => (r.status === 'fulfilled' ? r.value.status : 'refused'));
    expect(statuses.filter((s) => s === 'approved')).toHaveLength(1);
    const devices = await db.select().from(wardenDevice).where(eq(wardenDevice.name, 'Racer'));
    expect(devices).toHaveLength(1);
  });

  it('reports a denial and audits it', async () => {
    const { created, code } = await request();
    await claim(code.id);
    await decide(code.id, 'denied');
    await wait(code.id);
    expect(await wardenDeviceLinkService.poll(created.requestId, created.pollSecret)).toEqual({
      status: 'denied',
    });
    const audit = await db.select().from(wardenAudit).where(eq(wardenAudit.action, 'device.deny'));
    expect(
      audit.some((a) => (a.data as { requestId?: string }).requestId === created.requestId),
    ).toBe(true);
  });

  it('expires a pending request', async () => {
    const { created, code } = await request();
    await db
      .update(deviceCode)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(deviceCode.id, code.id));
    expect(await wardenDeviceLinkService.poll(created.requestId, created.pollSecret)).toEqual({
      status: 'expired',
    });
  });

  it('refuses to hand over a token long after the code expired', async () => {
    const { created, code } = await request();
    await claim(code.id);
    await decide(code.id, 'approved');
    await db
      .update(deviceCode)
      .set({ expiresAt: new Date(Date.now() - 6 * 60_000), lastPolledAt: null })
      .where(eq(deviceCode.id, code.id));
    expect(await wardenDeviceLinkService.poll(created.requestId, created.pollSecret)).toEqual({
      status: 'expired',
    });
  });

  it('makes a poll that comes too soon wait', async () => {
    const { created } = await request();
    await wardenDeviceLinkService.poll(created.requestId, created.pollSecret);
    await expect(
      wardenDeviceLinkService.poll(created.requestId, created.pollSecret),
    ).rejects.toMatchObject({ statusCode: 429, data: { problem: 'slowDown' } });
  });

  it('treats a wrong secret or an unknown id as not found', async () => {
    const { created } = await request();
    await expect(
      wardenDeviceLinkService.poll(created.requestId, 'not-the-secret'),
    ).rejects.toMatchObject({ statusCode: 404, data: { problem: 'notFound' } });
    await expect(
      wardenDeviceLinkService.poll('11111111-1111-4111-8111-111111111111', created.pollSecret),
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('leaves other codes alone', async () => {
    const [other] = await db
      .insert(deviceCode)
      .values({
        id: 'other-code',
        deviceCode: 'secret',
        userCode: '999999',
        expiresAt: new Date(Date.now() + 60_000),
        status: 'pending',
        clientId: 'warden',
      })
      .onConflictDoNothing()
      .returning();
    expect(other?.id ?? 'other-code').toBe('other-code');
    expect(await decide('other-code', 'approved')).toEqual({ handled: false });
  });
});
