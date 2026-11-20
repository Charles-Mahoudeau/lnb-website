import { eq } from 'drizzle-orm';
import { beforeAll, describe, expect, it } from 'vitest';

import { db } from '~~/server/db';
import { minecraftAccount, user, audit as auditLog, wardenBan } from '~~/server/db/schema';
import { wardenEventService } from '~~/server/services/warden/events';
import { wardenModerationService } from '~~/server/services/warden/moderation';

const TARGET = 'ban-update-target';
const ADMIN = 'ban-update-admin';
const UUID = '00000000-0000-4000-8000-0000000b4a01';
const actor = { source: 'web', userId: ADMIN } as const;
const DAY = 24 * 3600 * 1000;

beforeAll(async () => {
  await db
    .insert(user)
    .values([
      { id: TARGET, name: 'Ban Target', email: 'ban-update-target@epitech.eu', tenantId: 't' },
      { id: ADMIN, name: 'Ban Admin', email: 'ban-update-admin@epitech.eu', tenantId: 't' },
    ])
    .onConflictDoNothing();
  await db
    .insert(minecraftAccount)
    .values({ uuid: UUID, userId: TARGET, username: 'BanTarget' })
    .onConflictDoNothing();
});

async function newBan(expiresAt: Date | null) {
  const [ban] = await db
    .insert(wardenBan)
    .values({ userId: TARGET, reason: 'Griefing', source: 'web', expiresAt })
    .returning();
  return ban!;
}

describe('changing the end of a ban', () => {
  it('moves the end, audits it and tells the server', async () => {
    const ban = await newBan(new Date(Date.now() + DAY));
    const before = await wardenEventService.latestId();
    const end = new Date(Date.now() + 30 * DAY).toISOString();

    const view = await wardenModerationService.updateBan({ banId: ban.id, expiresAt: end, actor });
    expect(view.expiresAt).toBe(end);

    const [row] = await db.select().from(wardenBan).where(eq(wardenBan.id, ban.id));
    expect(row?.expiresAt?.toISOString()).toBe(end);

    const audits = await db.select().from(auditLog).where(eq(auditLog.targetUserId, TARGET));
    const entry = audits.find((audit) => audit.action === 'minecraft.ban.update');
    expect(entry).toMatchObject({
      actorUserId: ADMIN,
      data: { banId: ban.id, expiresAt: end, before: ban.expiresAt?.toISOString() },
    });

    const events = await wardenEventService.since(before);
    expect(events.map((e) => e.event)).toEqual([
      {
        type: 'kick',
        data: {
          uuids: [UUID],
          reason: 'banned',
          ban: { reason: 'Griefing', expiresAt: end, rules: [] },
        },
      },
    ]);
  });

  it('makes a ban permanent with a null end', async () => {
    const ban = await newBan(new Date(Date.now() + DAY));
    const before = await wardenEventService.latestId();
    const view = await wardenModerationService.updateBan({
      banId: ban.id,
      expiresAt: null,
      actor,
    });
    expect(view.expiresAt).toBeNull();
    const [event] = await wardenEventService.since(before);
    expect(event?.event).toMatchObject({ data: { ban: { expiresAt: null } } });
  });

  it('refuses an end in the past, a ban that is over and an unknown ban', async () => {
    const ban = await newBan(null);
    await expect(
      wardenModerationService.updateBan({
        banId: ban.id,
        expiresAt: new Date(Date.now() - 1000).toISOString(),
        actor,
      }),
    ).rejects.toMatchObject({ data: { problem: 'invalidEnd' } });

    await wardenModerationService.revokeById({ banId: ban.id, actor });
    await expect(
      wardenModerationService.updateBan({ banId: ban.id, expiresAt: null, actor }),
    ).rejects.toMatchObject({ data: { problem: 'notBanned' } });

    const expired = await newBan(new Date(Date.now() - DAY));
    await expect(
      wardenModerationService.updateBan({ banId: expired.id, expiresAt: null, actor }),
    ).rejects.toMatchObject({ data: { problem: 'notBanned' } });

    await expect(
      wardenModerationService.updateBan({
        banId: '00000000-0000-4000-8000-000000000000',
        expiresAt: null,
        actor,
      }),
    ).rejects.toMatchObject({ data: { problem: 'notFound' } });
  });
});
