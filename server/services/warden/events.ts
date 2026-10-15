import { and, asc, eq, gt, inArray, max } from 'drizzle-orm';

import { db } from '~~/server/db';
import { minecraftAccount, wardenAudit, wardenBan } from '~~/server/db/schema';
import type { WardenAuditAction } from '~~/server/db/schema';

import { wardenSettingsService } from './settings';

import type { WardenEvent, WardenSettingsView } from '#shared/schemas/warden';

// Events for the Minecraft server come from the audit log: every change that matters to the
// server is audited in the same transaction, so reading the log after an ID gives exactly the
// committed changes, in order, and a reconnecting server replays what it missed.

const EVENT_ACTIONS = [
  'ban',
  'unban',
  'unlink',
  'token.rotate',
  'link',
  'settings.update',
] as const satisfies readonly WardenAuditAction[];

/** The newest audit ID, where a server that sends no Last-Event-ID starts. */
async function latestId(): Promise<number> {
  const [row] = await db.select({ id: max(wardenAudit.id) }).from(wardenAudit);
  return row?.id ?? 0;
}

/** The events after `afterId`, oldest first, with the audit ID they came from. */
async function since(afterId: number, limit = 500): Promise<{ id: number; event: WardenEvent }[]> {
  const rows = await db
    .select()
    .from(wardenAudit)
    .where(and(gt(wardenAudit.id, afterId), inArray(wardenAudit.action, [...EVENT_ACTIONS])))
    .orderBy(asc(wardenAudit.id))
    .limit(limit);
  const events: { id: number; event: WardenEvent }[] = [];
  for (const row of rows) {
    const event = await toEvent(row);
    if (event) events.push({ id: row.id, event });
  }
  return events;
}

async function accountsOf(userId: string | null): Promise<string[]> {
  if (!userId) return [];
  const rows = await db
    .select({ uuid: minecraftAccount.uuid })
    .from(minecraftAccount)
    .where(eq(minecraftAccount.userId, userId));
  return rows.map((row) => row.uuid);
}

async function toEvent(row: typeof wardenAudit.$inferSelect): Promise<WardenEvent | undefined> {
  const data = row.data;
  switch (row.action) {
    case 'ban': {
      const banId = typeof data.banId === 'string' ? data.banId : undefined;
      const [ban] = banId ? await db.select().from(wardenBan).where(eq(wardenBan.id, banId)) : [];
      return {
        type: 'kick',
        data: {
          uuids: await accountsOf(row.targetUserId),
          reason: 'banned',
          ban: ban
            ? { reason: ban.reason, expiresAt: ban.expiresAt?.toISOString() ?? null }
            : undefined,
        },
      };
    }
    case 'unban':
      // A ban replaced by a new one isn't lifted: the ban event right after it follows.
      if (data.reason === 'superseded') return undefined;
      return { type: 'unban', data: { uuids: await accountsOf(row.targetUserId) } };
    case 'unlink':
      return row.targetMinecraftUuid
        ? { type: 'kick', data: { uuids: [row.targetMinecraftUuid], reason: 'unlinked' } }
        : undefined;
    case 'token.rotate':
      return {
        type: 'kick',
        data: { uuids: await accountsOf(row.targetUserId), reason: 'tokenRotated' },
      };
    case 'link':
      return row.targetMinecraftUuid && row.targetUserId
        ? {
            type: 'link',
            data: {
              requestId: typeof data.requestId === 'string' ? data.requestId : null,
              uuid: row.targetMinecraftUuid,
              userId: row.targetUserId,
            },
          }
        : undefined;
    case 'settings.update': {
      const settings = data.settings as WardenSettingsView | undefined;
      return { type: 'settings', data: settings ?? (await wardenSettingsService.get()) };
    }
    default:
      return undefined;
  }
}

export const wardenEventService = { latestId, since };
