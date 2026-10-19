import { and, count, eq, gte, inArray, isNull, or } from 'drizzle-orm';

import { db } from '~~/server/db';
import type { Db } from '~~/server/db';
import { pushNotification, pushPreference, pushSubscription } from '~~/server/db/schema';
import type { PushKind } from '~~/server/db/schema';
import { flagService } from '~~/server/services/flags';

import { WEEK_MS, afterQuietHours, countOverCap } from './rules';
import { pushSettingsService } from './settings';

import type { FlagKey } from '#shared/flags';
import type { PushImpactView } from '#shared/schemas/push';

// Queues notifications. Callers do it in their own transaction, so a change and the notification
// about it stand or fall together. Nothing is sent here: push:deliver does that.

const KIND_FLAG: Record<PushKind, FlagKey> = {
  newEvent: 'push.newEvents',
  reminder: 'push.reminders',
  spot: 'push.spots',
  cancelled: 'push.changes',
  rescheduled: 'push.changes',
};

const KIND_PREFERENCE = {
  newEvent: pushPreference.newEvents,
  reminder: pushPreference.reminders,
  spot: pushPreference.spots,
  cancelled: pushPreference.changes,
  rescheduled: pushPreference.changes,
} as const;

/** Whether the kind may be queued right now: the feature and the kind's own flag are on. */
async function allowed(kind: PushKind): Promise<boolean> {
  return (await flagService.isEnabled('push')) && (await flagService.isEnabled(KIND_FLAG[kind]));
}

/** Of these accounts, the ones with a device that want this kind of notification. */
async function eligible(dbx: Db, kind: PushKind, userIds: string[]): Promise<string[]> {
  if (userIds.length === 0) return [];
  const rows = await dbx
    .selectDistinct({ userId: pushSubscription.userId })
    .from(pushSubscription)
    .leftJoin(pushPreference, eq(pushPreference.userId, pushSubscription.userId))
    .where(
      and(
        inArray(pushSubscription.userId, userIds),
        or(isNull(KIND_PREFERENCE[kind]), eq(KIND_PREFERENCE[kind], true)),
      ),
    );
  return rows.map((row) => row.userId);
}

export interface Enqueue {
  kind: PushKind;
  eventId: string;
  userIds: string[];
  params?: Record<string, unknown>;
  /** One key per notification, so queueing it twice sends it once. */
  dedupe?: (userId: string) => string;
  now?: Date;
}

/** Queues a notification for each account that can get it. Returns how many were queued. */
async function enqueue(tx: Db, input: Enqueue): Promise<number> {
  if (!(await allowed(input.kind))) return 0;
  const userIds = await eligible(tx, input.kind, [...new Set(input.userIds)]);
  if (userIds.length === 0) return 0;
  const now = input.now ?? new Date();
  // Announcements wait for the morning. The rest is about now, so it goes out at once.
  const sendAt = input.kind === 'newEvent' ? afterQuietHours(now) : now;
  const rows = await tx
    .insert(pushNotification)
    .values(
      userIds.map((userId) => ({
        userId,
        kind: input.kind,
        eventId: input.eventId,
        params: input.params ?? {},
        sendAt,
        dedupeKey: input.dedupe?.(userId) ?? null,
      })),
    )
    .onConflictDoNothing({ target: pushNotification.dedupeKey })
    .returning({ id: pushNotification.id });
  return rows.length;
}

/** Drops what hasn't gone out yet for an event, such as reminders of a cancelled one. */
async function dropPending(tx: Db, eventId: string, kinds: PushKind[]): Promise<void> {
  await tx
    .update(pushNotification)
    .set({ status: 'skipped', lastError: 'dropped' })
    .where(
      and(
        eq(pushNotification.eventId, eventId),
        eq(pushNotification.status, 'pending'),
        inArray(pushNotification.kind, kinds),
      ),
    );
}

/** Notifications sent to each of these accounts in the last 7 days. Missing: none. */
async function receivedByUser(userIds: string[], now = new Date()): Promise<Map<string, number>> {
  if (userIds.length === 0) return new Map();
  const rows = await db
    .select({ userId: pushNotification.userId, n: count() })
    .from(pushNotification)
    .where(
      and(
        inArray(pushNotification.userId, userIds),
        eq(pushNotification.status, 'sent'),
        gte(pushNotification.sentAt, new Date(now.getTime() - WEEK_MS)),
      ),
    )
    .groupBy(pushNotification.userId);
  return new Map(rows.map((row) => [row.userId, row.n]));
}

/**
 * What an action would send, for the manager's confirmation: how many people would get it, and
 * how many of them already received the weekly limit. Nothing is blocked either way.
 */
async function impact(
  kind: PushKind,
  audience: string[],
): Promise<Omit<PushImpactView, 'preview'>> {
  const settings = await pushSettingsService.get();
  const recipients = (await allowed(kind)) ? await eligible(db, kind, audience) : [];
  const received = await receivedByUser(recipients);
  return {
    recipients: recipients.length,
    audience: audience.length,
    overCap: countOverCap(
      recipients.map((id) => received.get(id) ?? 0),
      settings.weeklyCap,
    ),
    weeklyCap: settings.weeklyCap,
  };
}

export const pushQueueService = { allowed, eligible, enqueue, dropPending, impact };
