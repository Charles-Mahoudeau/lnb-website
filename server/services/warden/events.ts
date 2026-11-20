import { and, asc, eq, gt, inArray, max } from 'drizzle-orm';

import { db } from '~~/server/db';
import { audit, minecraftAccount, wardenBan } from '~~/server/db/schema';
import type { AuditAction } from '~~/server/db/schema';

import { wardenSettingsService } from './settings';

import type { WardenEvent, WardenSettingsView } from '#shared/schemas/warden';

type AnticheatVerdictEvent = Extract<WardenEvent, { type: 'anticheatVerdict' }>['data'];
type AnticheatAlertEvent = Extract<WardenEvent, { type: 'anticheatAlert' }>['data'];
type PlaytimeEvent<T extends WardenEvent['type']> = Extract<WardenEvent, { type: T }>['data'];

// Events for the Minecraft server come from the audit log: every change that matters to the
// server is audited in the same transaction, so reading the log after an ID gives exactly the
// committed changes, in order, and a reconnecting server replays what it missed.

const EVENT_ACTIONS = [
  'minecraft.ban',
  'minecraft.ban.update',
  'minecraft.unban',
  'minecraft.unlink',
  'minecraft.device.revoke',
  'minecraft.settings.update',
  'minecraft.anticheat.verdict',
  'minecraft.anticheat.alert',
  'minecraft.playtime.warning',
  'minecraft.playtime.grace',
  'minecraft.playtime.update',
  'minecraft.playtime.kick',
] as const satisfies readonly AuditAction[];

/**
 * Where a connection starts reading: after the ID the server last saw, or, when it sent none or
 * one above the newest (it kept an ID from before the IDs restarted), from the newest.
 */
async function startAfter(lastEventId: number | null): Promise<number> {
  const newest = await latestId();
  return lastEventId !== null && lastEventId >= 0 && lastEventId <= newest ? lastEventId : newest;
}

/** The newest audit ID, where a server that sends no Last-Event-ID starts. */
async function latestId(): Promise<number> {
  const [row] = await db.select({ id: max(audit.id) }).from(audit);
  return row?.id ?? 0;
}

/** The events after `afterId`, oldest first, with the audit ID they came from. */
async function since(afterId: number, limit = 500): Promise<{ id: number; event: WardenEvent }[]> {
  const rows = await db
    .select()
    .from(audit)
    .where(and(gt(audit.id, afterId), inArray(audit.action, [...EVENT_ACTIONS])))
    .orderBy(asc(audit.id))
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

async function toEvent(row: typeof audit.$inferSelect): Promise<WardenEvent | undefined> {
  const data = row.data;
  switch (row.action) {
    // A new end is sent as the ban again: the server has no event of its own for it.
    case 'minecraft.ban':
    case 'minecraft.ban.update': {
      const banId = typeof data.banId === 'string' ? data.banId : undefined;
      const [ban] = banId ? await db.select().from(wardenBan).where(eq(wardenBan.id, banId)) : [];
      return {
        type: 'kick',
        data: {
          uuids: await accountsOf(row.targetUserId),
          reason: 'banned',
          ban: ban
            ? {
                reason: ban.reason,
                expiresAt: ban.expiresAt?.toISOString() ?? null,
                rules: ban.ruleCitations,
              }
            : undefined,
        },
      };
    }
    case 'minecraft.unban':
      // A ban replaced by a new one isn't lifted: the ban event right after it follows.
      if (data.reason === 'superseded') return undefined;
      return { type: 'unban', data: { uuids: await accountsOf(row.targetUserId) } };
    case 'minecraft.unlink':
      return row.targetMinecraftUuid
        ? { type: 'kick', data: { uuids: [row.targetMinecraftUuid], reason: 'unlinked' } }
        : undefined;
    case 'minecraft.device.revoke': {
      // The sessions the device had open, kept in the audit row when it was revoked.
      const uuids = Array.isArray(data.uuids) ? (data.uuids as string[]) : [];
      return uuids.length ? { type: 'kick', data: { uuids, reason: 'deviceRevoked' } } : undefined;
    }
    case 'minecraft.settings.update': {
      const settings = data.settings as WardenSettingsView | undefined;
      return { type: 'settings', data: settings ?? (await wardenSettingsService.get()) };
    }
    // The audit rows hold the whole event, written by the anticheat.
    case 'minecraft.anticheat.verdict':
      return { type: 'anticheatVerdict', data: data as AnticheatVerdictEvent };
    case 'minecraft.anticheat.alert':
      return { type: 'anticheatAlert', data: data as AnticheatAlertEvent };
    // The playtime timer writes the events it sends (docs/playtime.md): `uuids` and the rest.
    case 'minecraft.playtime.warning':
      return { type: 'playtimeWarning', data: data as PlaytimeEvent<'playtimeWarning'> };
    case 'minecraft.playtime.grace':
      return { type: 'playtimeGrace', data: data as PlaytimeEvent<'playtimeGrace'> };
    case 'minecraft.playtime.update':
      return { type: 'playtimeUpdate', data: data as PlaytimeEvent<'playtimeUpdate'> };
    case 'minecraft.playtime.kick':
      return { type: 'kick', data: data as PlaytimeEvent<'kick'> };
    default:
      return undefined;
  }
}

export const wardenEventService = { latestId, startAfter, since };
