import { and, asc, eq, inArray, lte, sql } from 'drizzle-orm';
import webpush from 'web-push';

import { db } from '~~/server/db';
import {
  event,
  eventRegistration,
  eventRoom,
  pushNotification,
  pushPreference,
  pushSubscription,
} from '~~/server/db/schema';
import type { PushKind } from '~~/server/db/schema';
import { pushConfigured, pushEnv } from '~~/server/lib/push-env';

import { buildMessage } from './messages';
import { nextPushAttempt, pushTtl } from './rules';

// Sends the queued notifications to every device of the account. push:deliver runs this every
// minute. A row is claimed by moving its send_at forward, so two runs never send the same one.

type Notification = typeof pushNotification.$inferSelect;

const BATCH = 50;
/** How long a claimed row is left alone before another run may take it. */
const CLAIM_MS = 5 * 60_000;

let configuredFor: string | undefined;

function setUp(): void {
  const { VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT } = pushEnv();
  const key = [VAPID_SUBJECT, VAPID_PUBLIC_KEY].join('|');
  if (configuredFor === key) return;
  webpush.setVapidDetails(VAPID_SUBJECT!, VAPID_PUBLIC_KEY!, VAPID_PRIVATE_KEY!);
  configuredFor = key;
}

const PREFERENCE_COLUMN = {
  newEvent: 'newEvents',
  reminder: 'reminders',
  spot: 'spots',
  cancelled: 'changes',
  rescheduled: 'changes',
} as const satisfies Record<PushKind, keyof typeof pushPreference.$inferSelect>;

/** Takes the due rows: counts the attempt and pushes send_at out, so a crash retries later. */
async function claim(now: Date): Promise<Notification[]> {
  const claimUntil = new Date(now.getTime() + CLAIM_MS);
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: pushNotification.id })
      .from(pushNotification)
      .where(and(eq(pushNotification.status, 'pending'), lte(pushNotification.sendAt, now)))
      .orderBy(asc(pushNotification.sendAt))
      .limit(BATCH)
      .for('update', { skipLocked: true });
    if (due.length === 0) return [];
    return tx
      .update(pushNotification)
      .set({ attempts: sql`${pushNotification.attempts} + 1`, sendAt: claimUntil })
      .where(
        inArray(
          pushNotification.id,
          due.map((row) => row.id),
        ),
      )
      .returning();
  });
}

async function finish(
  row: Notification,
  status: 'sent' | 'skipped' | 'failed',
  note: string | null,
  now: Date,
) {
  await db
    .update(pushNotification)
    .set({ status, lastError: note, sentAt: status === 'sent' ? now : null })
    .where(eq(pushNotification.id, row.id));
}

/** Whether the notification still makes sense now: people's plans change between queue and send. */
async function stillRelevant(
  row: Notification,
  info: { hidden: boolean; cancelledAt: Date | null; startsAt: Date },
  now: Date,
): Promise<string | null> {
  if (row.kind === 'newEvent' && (info.hidden || info.cancelledAt)) return 'eventGone';
  if (row.kind !== 'cancelled' && info.cancelledAt) return 'cancelled';
  if (row.kind === 'reminder' || row.kind === 'spot') {
    if (info.startsAt <= now) return 'started';
    const [mine] = await db
      .select({ status: eventRegistration.status })
      .from(eventRegistration)
      .where(
        and(eq(eventRegistration.eventId, row.eventId!), eq(eventRegistration.userId, row.userId)),
      );
    if (mine?.status !== 'registered') return 'notRegistered';
  }
  return null;
}

async function deliverOne(row: Notification, now: Date): Promise<'sent' | 'skipped' | 'retry'> {
  const [found] = row.eventId
    ? await db
        .select({ e: event, room: eventRoom.name })
        .from(event)
        .innerJoin(eventRoom, eq(eventRoom.id, event.roomId))
        .where(eq(event.id, row.eventId))
    : [];
  if (!found) {
    await finish(row, 'skipped', 'eventGone', now);
    return 'skipped';
  }
  const why = await stillRelevant(row, found.e, now);
  if (why) {
    await finish(row, 'skipped', why, now);
    return 'skipped';
  }

  const [preference] = await db
    .select()
    .from(pushPreference)
    .where(eq(pushPreference.userId, row.userId));
  if (preference && !preference[PREFERENCE_COLUMN[row.kind]]) {
    await finish(row, 'skipped', 'switchedOff', now);
    return 'skipped';
  }

  const devices = await db
    .select()
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, row.userId));
  if (devices.length === 0) {
    await finish(row, 'skipped', 'noDevice', now);
    return 'skipped';
  }

  let delivered = 0;
  let transient: string | null = null;
  for (const device of devices) {
    const message = buildMessage(
      row.kind,
      device.locale === 'fr' ? 'fr' : 'en',
      { id: found.e.id, name: found.e.name, startsAt: found.e.startsAt, room: found.room },
      { offset: typeof row.params.offset === 'number' ? row.params.offset : undefined },
    );
    try {
      await webpush.sendNotification(
        { endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
        JSON.stringify(message),
        {
          TTL: pushTtl(row.kind, found.e.startsAt, now),
          urgency: row.kind === 'newEvent' ? 'low' : 'high',
        },
      );
      delivered++;
      await db
        .update(pushSubscription)
        .set({ lastSuccessAt: now })
        .where(eq(pushSubscription.id, device.id));
    } catch (error) {
      const status = (error as { statusCode?: number }).statusCode;
      if (status === 404 || status === 410) {
        // The browser or the user ended this subscription: it will never work again.
        await db.delete(pushSubscription).where(eq(pushSubscription.id, device.id));
      } else {
        transient = `status ${String(status ?? 'unreachable')}`;
      }
    }
  }

  if (delivered > 0) {
    await finish(row, 'sent', null, now);
    return 'sent';
  }
  if (!transient) {
    await finish(row, 'skipped', 'noDevice', now);
    return 'skipped';
  }
  const retryAt = nextPushAttempt(row.attempts, now);
  if (!retryAt) {
    await finish(row, 'failed', transient, now);
    return 'skipped';
  }
  await db
    .update(pushNotification)
    .set({ sendAt: retryAt, lastError: transient })
    .where(eq(pushNotification.id, row.id));
  return 'retry';
}

/** Sends what is due. Run every minute by push:deliver. */
async function processDue(
  now = new Date(),
): Promise<{ sent: number; skipped: number; retry: number }> {
  const result = { sent: 0, skipped: 0, retry: 0 };
  if (!pushConfigured()) return result;
  setUp();
  for (const row of await claim(now)) {
    const outcome = await deliverOne(row, now);
    result[outcome]++;
  }
  return result;
}

export const pushDeliverService = { processDue };
