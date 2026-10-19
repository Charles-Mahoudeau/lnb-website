import { and, count, desc, eq, gte, inArray } from 'drizzle-orm';

import { db } from '~~/server/db';
import { pushNotification, pushPreference, pushSubscription } from '~~/server/db/schema';
import { pushConfigured, pushEnv } from '~~/server/lib/push-env';

import { WEEK_MS, deviceName } from './rules';
import { pushSettingsService } from './settings';

import { pushPreferences } from '#shared/schemas/push';
import type { PushPreferences, PushStatusView, PushSubscribeBody } from '#shared/schemas/push';

// Devices that allowed notifications, and each account's four switches.

const ALL_ON: PushPreferences = { newEvents: true, reminders: true, spots: true, changes: true };

/** The switches of an account. No row: all on. */
async function preferencesOf(userId: string): Promise<PushPreferences> {
  const [row] = await db.select().from(pushPreference).where(eq(pushPreference.userId, userId));
  return row
    ? {
        newEvents: row.newEvents,
        reminders: row.reminders,
        spots: row.spots,
        changes: row.changes,
      }
    : ALL_ON;
}

async function setPreferences(userId: string, patch: Partial<PushPreferences>) {
  const next = pushPreferences.parse({ ...(await preferencesOf(userId)), ...patch });
  await db
    .insert(pushPreference)
    .values({ userId, ...next })
    .onConflictDoUpdate({ target: pushPreference.userId, set: next });
  return next;
}

/** Saves a browser's subscription for the account. The same browser signing in again moves over. */
async function subscribe(input: {
  userId: string;
  body: PushSubscribeBody;
  userAgent: string | undefined;
}): Promise<void> {
  const { endpoint, keys, locale } = input.body;
  const values = {
    userId: input.userId,
    endpoint,
    p256dh: keys.p256dh,
    auth: keys.auth,
    locale,
    device: deviceName(input.userAgent),
  };
  await db
    .insert(pushSubscription)
    .values(values)
    .onConflictDoUpdate({
      target: pushSubscription.endpoint,
      set: {
        userId: values.userId,
        p256dh: values.p256dh,
        auth: values.auth,
        locale,
        device: values.device,
      },
    });
}

/** Removes a device. Only the account's own. */
async function unsubscribe(userId: string, endpoint: string): Promise<void> {
  await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)));
}

async function removeDevice(userId: string, id: number): Promise<void> {
  await db
    .delete(pushSubscription)
    .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.id, id)));
}

async function setLocale(userId: string, endpoint: string, locale: 'en' | 'fr'): Promise<void> {
  await db
    .update(pushSubscription)
    .set({ locale })
    .where(and(eq(pushSubscription.userId, userId), eq(pushSubscription.endpoint, endpoint)));
}

/** Notifications that went out to the account in the last 7 days. */
async function receivedLast7Days(userId: string, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(pushNotification)
    .where(
      and(
        eq(pushNotification.userId, userId),
        eq(pushNotification.status, 'sent'),
        gte(pushNotification.sentAt, new Date(now.getTime() - WEEK_MS)),
      ),
    );
  return row?.n ?? 0;
}

/** What /account needs: the switches, the devices and the counts. */
async function status(userId: string, enabled: boolean): Promise<PushStatusView> {
  const devices = await db
    .select()
    .from(pushSubscription)
    .where(eq(pushSubscription.userId, userId))
    .orderBy(desc(pushSubscription.createdAt));
  const settings = await pushSettingsService.get();
  return {
    enabled,
    configured: pushConfigured(),
    publicKey: pushConfigured() ? (pushEnv().VAPID_PUBLIC_KEY ?? null) : null,
    preferences: await preferencesOf(userId),
    devices: devices.map((device) => ({
      id: device.id,
      device: device.device,
      createdAt: device.createdAt.toISOString(),
      endpoint: device.endpoint,
    })),
    receivedLast7Days: await receivedLast7Days(userId),
    silenceDays: settings.silenceDays,
  };
}

/** Which of these accounts have at least one device. */
async function withDevices(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ userId: pushSubscription.userId })
    .from(pushSubscription)
    .where(inArray(pushSubscription.userId, userIds));
  return new Set(rows.map((row) => row.userId));
}

export const pushSubscriptionService = {
  preferencesOf,
  setPreferences,
  subscribe,
  unsubscribe,
  removeDevice,
  setLocale,
  receivedLast7Days,
  status,
  withDevices,
};
