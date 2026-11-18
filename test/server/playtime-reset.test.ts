import { eq } from 'drizzle-orm';
import { describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import {
  minecraftAccount,
  playtimeGrant,
  playtimeLedger,
  playtimeNotice,
  user,
  wardenAudit,
  wardenSession,
} from '~~/server/db/schema';
import { playtimeAdminService } from '~~/server/services/playtime/admin';

const EPITECH = '901cb4ca-b862-4029-9306-e5cd0f6d9f86';

let counter = 0;
async function setup(open: boolean) {
  const id = `reset-${String(++counter)}-${String(Date.now())}`;
  await db.insert(user).values({ id, name: 'Reset', email: `${id}@epitech.eu`, tenantId: EPITECH });
  const uuid = crypto.randomUUID();
  await db
    .insert(minecraftAccount)
    .values({ uuid, userId: id, username: `R${String(counter)}x${String(Date.now() % 10000)}` });
  const startedAt = new Date(Date.now() - 7200_000);
  const [session] = await db
    .insert(wardenSession)
    .values({
      minecraftUuid: uuid,
      userId: id,
      startedAt,
      lastHeartbeatAt: new Date(),
      endedAt: open ? null : new Date(),
    })
    .returning({ id: wardenSession.id });
  const countedUntil = new Date(Date.now() - 60_000);
  await db.insert(playtimeLedger).values({
    sessionId: session!.id,
    weekStart: '2031-12-01',
    userId: id,
    minecraftUuid: uuid,
    countedSeconds: 600,
    graceSeconds: 30,
    freeSeconds: 90,
    countedUntil,
  });
  await db.insert(playtimeNotice).values({ sessionId: session!.id, kind: 'w10' });
  return { id, sessionId: session!.id, countedUntil };
}

describe('the playtime reset', () => {
  it('asks for the sentence', async () => {
    const admin = await setup(false);
    await expect(
      playtimeAdminService.reset({ source: 'web', userId: admin.id }, 'nope'),
    ).rejects.toMatchObject({ data: { problem: 'confirmMismatch' } });
  });

  it('wipes the counted time and the warnings, and keeps grants and open sessions counting', async () => {
    const ended = await setup(false);
    const live = await setup(true);
    await db
      .insert(playtimeGrant)
      .values({ userId: ended.id, weekStart: '2031-12-01', seconds: 600, reason: 'x' });

    await playtimeAdminService.reset({ source: 'web', userId: ended.id }, ' Reset the playtime ');

    expect(
      await db.select().from(playtimeLedger).where(eq(playtimeLedger.userId, ended.id)),
    ).toEqual([]);
    // The open session keeps where it stopped counting, with nothing counted yet.
    const [row] = await db.select().from(playtimeLedger).where(eq(playtimeLedger.userId, live.id));
    expect(row).toMatchObject({
      countedSeconds: 0,
      graceSeconds: 0,
      overSeconds: 0,
      freeSeconds: 0,
    });
    expect(row?.countedUntil.getTime()).toBe(live.countedUntil.getTime());
    expect(await db.select().from(playtimeNotice)).toEqual([]);
    expect(
      await db.select().from(playtimeGrant).where(eq(playtimeGrant.userId, ended.id)),
    ).toHaveLength(1);
    const audits = await db.select().from(wardenAudit).where(eq(wardenAudit.actorUserId, ended.id));
    expect(audits.map((entry) => entry.action)).toContain('playtime.reset');
  });
});
