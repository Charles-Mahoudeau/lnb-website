import { and, count, desc, eq, gte, lt, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import { pushNotification, pushPreference, pushSubscription, user } from '~~/server/db/schema';
import type { PushKind } from '~~/server/db/schema';

import { WEEK_MS } from './rules';
import { pushSettingsService } from './settings';

import { PUSH_KINDS } from '#shared/schemas/push';
import type { PushOverview, PushSubscriberRow } from '#shared/schemas/push';
import { schoolForTenant } from '#shared/utils/schools';

// What admins see: counts for the week, and who turned notifications on.

const sentSince = (since: Date) =>
  and(eq(pushNotification.status, 'sent'), gte(pushNotification.sentAt, since));

async function overview(now = new Date()): Promise<PushOverview> {
  const since = new Date(now.getTime() - WEEK_MS);
  const settings = await pushSettingsService.get();

  const perUser = await db
    .select({ userId: pushNotification.userId, n: count() })
    .from(pushNotification)
    .where(sentSince(since))
    .groupBy(pushNotification.userId);
  const perKind = await db
    .select({ kind: pushNotification.kind, n: count() })
    .from(pushNotification)
    .where(sentSince(since))
    .groupBy(pushNotification.kind);
  const [subscribers] = await db
    .select({ n: sql<number>`count(distinct ${pushSubscription.userId})::int` })
    .from(pushSubscription);
  const [accounts] = await db.select({ n: count() }).from(user);

  const byKind = Object.fromEntries(PUSH_KINDS.map((kind) => [kind, 0])) as Record<
    PushKind,
    number
  >;
  for (const row of perKind) byKind[row.kind] = row.n;

  return {
    weeklyCap: settings.weeklyCap,
    sentThisWeek: perUser.reduce((sum, row) => sum + row.n, 0),
    mostReceived: perUser.reduce((max, row) => Math.max(max, row.n), 0),
    overCap: perUser.filter((row) => row.n > settings.weeklyCap).length,
    subscribers: subscribers?.n ?? 0,
    accounts: accounts?.n ?? 0,
    byKind,
  };
}

/** Everyone with a device, newest first, with what they get and what they received. */
async function subscribers(now = new Date()): Promise<PushSubscriberRow[]> {
  const since = new Date(now.getTime() - WEEK_MS);
  const people = await db
    .select({
      userId: user.id,
      name: user.name,
      tenantId: user.tenantId,
      devices: count(pushSubscription.id),
      since: sql`min(${pushSubscription.createdAt})`.mapWith(pushSubscription.createdAt),
      preference: pushPreference,
    })
    .from(pushSubscription)
    .innerJoin(user, eq(user.id, pushSubscription.userId))
    .leftJoin(pushPreference, eq(pushPreference.userId, user.id))
    .groupBy(user.id, pushPreference.userId)
    .orderBy(desc(sql`min(${pushSubscription.createdAt})`))
    .limit(1000);
  const received = await db
    .select({ userId: pushNotification.userId, n: count() })
    .from(pushNotification)
    .where(sentSince(since))
    .groupBy(pushNotification.userId);
  const receivedBy = new Map(received.map((row) => [row.userId, row.n]));
  return people.map((row) => ({
    userId: row.userId,
    name: row.name,
    school: schoolForTenant(row.tenantId) ?? null,
    preferences: {
      newEvents: row.preference?.newEvents ?? true,
      reminders: row.preference?.reminders ?? true,
      spots: row.preference?.spots ?? true,
      changes: row.preference?.changes ?? true,
    },
    devices: row.devices,
    since: row.since.toISOString(),
    receivedLast7Days: receivedBy.get(row.userId) ?? 0,
  }));
}

/** Removes the log older than 90 days, and rows that never went out and can't any more. */
async function prune(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
  const removed = await db
    .delete(pushNotification)
    .where(lt(pushNotification.createdAt, cutoff))
    .returning({ id: pushNotification.id });
  return removed.length;
}

export const pushStatsService = { overview, subscribers, prune };
