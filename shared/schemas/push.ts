import { z } from 'zod';

// Web Push, about events only. See docs/push.md.

/** Minutes before the start that a reminder can be sent. */
export const REMINDER_PRESETS = [15, 60, 180, 1440, 2880, 10080] as const;
export const DEFAULT_REMINDER_OFFSETS: number[] = [60];

export const reminderOffsets = z
  .array(z.int().refine((minutes) => (REMINDER_PRESETS as readonly number[]).includes(minutes)))
  .max(REMINDER_PRESETS.length)
  .refine((offsets) => new Set(offsets).size === offsets.length)
  .describe('Minutes before the start. Empty: no reminder.');

export const PUSH_KINDS = ['newEvent', 'reminder', 'spot', 'cancelled', 'rescheduled'] as const;
export type PushKindName = (typeof PUSH_KINDS)[number];

/** The four switches an account has: which kinds of notification it wants. */
export const pushPreferences = z.object({
  newEvents: z.boolean().describe('When the BDE announces an event.'),
  reminders: z.boolean().describe('Before events the account is registered for.'),
  spots: z.boolean().describe('When a place opens on a waitlist, or a manager adds the account.'),
  changes: z.boolean().describe('When an event the account is on is cancelled or moved.'),
});
export type PushPreferences = z.infer<typeof pushPreferences>;

/** PATCH /api/push/preferences */
export const pushPreferencesPatch = pushPreferences.partial();

/** POST /api/push/subscription: what the browser's PushManager.subscribe() gives. */
export const pushSubscribeBody = z.object({
  endpoint: z.url().max(2048),
  keys: z.object({
    p256dh: z.string().min(1).max(256),
    auth: z.string().min(1).max(64),
  }),
  locale: z.enum(['en', 'fr']).describe('The language notifications are written in.'),
});
export type PushSubscribeBody = z.infer<typeof pushSubscribeBody>;

/** DELETE /api/push/subscription */
export const pushUnsubscribeBody = z.object({ endpoint: z.url().max(2048) });

/** PATCH /api/push/subscription: the language changed on the account page. */
export const pushLocaleBody = z.object({
  endpoint: z.url().max(2048),
  locale: z.enum(['en', 'fr']),
});

export const pushDeviceView = z.object({
  id: z.number(),
  device: z.string(),
  createdAt: z.string(),
  endpoint: z.string().describe('Lets the page tell which device is the current browser.'),
});
export type PushDeviceView = z.infer<typeof pushDeviceView>;

/** GET /api/push/status */
export const pushStatusView = z.object({
  enabled: z.boolean().describe('False while an admin has switched push off.'),
  configured: z.boolean().describe('False when the server has no VAPID keys.'),
  publicKey: z.string().nullable().describe('The VAPID public key for PushManager.subscribe().'),
  preferences: pushPreferences,
  devices: z.array(pushDeviceView),
  receivedLast7Days: z.number(),
  silenceDays: z
    .number()
    .nullable()
    .describe('Days the prompt stays quiet after "Not now". Null: never ask again.'),
});
export type PushStatusView = z.infer<typeof pushStatusView>;

/** The admin settings. */
export const pushSettings = z.object({
  weeklyCap: z.int().min(1).max(50).describe('Notifications a week before an admin is warned.'),
  silenceDays: z
    .union([z.literal(7), z.literal(30), z.null()])
    .describe('Days the prompt stays quiet after "Not now". Null: never ask again.'),
});
export type PushSettings = z.infer<typeof pushSettings>;

export const PUSH_DEFAULT_SETTINGS: PushSettings = { weeklyCap: 3, silenceDays: 30 };

/** GET /api/admin/push/overview: counts only, for events managers too. */
export const pushOverview = z.object({
  weeklyCap: z.number(),
  sentThisWeek: z.number(),
  mostReceived: z.number().describe('The most notifications one account received this week.'),
  overCap: z.number().describe('Accounts that received more than the weekly limit.'),
  subscribers: z.number().describe('Accounts with at least one device.'),
  accounts: z.number(),
  byKind: z.record(z.enum(PUSH_KINDS), z.number()),
});
export type PushOverview = z.infer<typeof pushOverview>;

export const pushSubscriberRow = z.object({
  userId: z.string(),
  name: z.string(),
  school: z.string().nullable(),
  preferences: pushPreferences,
  devices: z.number(),
  since: z.string(),
  receivedLast7Days: z.number(),
});
export type PushSubscriberRow = z.infer<typeof pushSubscriberRow>;

/** GET /api/admin/push/subscribers */
export const pushSubscriberList = z.object({ items: z.array(pushSubscriberRow) });

const impactBase = {
  locale: z.enum(['en', 'fr']).default('en').describe('The language of the preview.'),
};

/** POST /api/admin/events/:id/push-impact: what an action would send, before it does. */
export const pushImpactBody = z.discriminatedUnion('action', [
  z.object({ action: z.literal('announce'), ...impactBase }),
  z.object({ action: z.literal('cancel'), ...impactBase }),
  z.object({
    action: z.literal('reschedule'),
    startsAt: z.iso
      .datetime({ offset: true })
      .optional()
      .describe('The new start, for the preview.'),
    ...impactBase,
  }),
  z.object({
    action: z.literal('capacity'),
    capacity: z.int().positive().max(10_000).nullable(),
    ...impactBase,
  }),
  z.object({ action: z.literal('add'), userId: z.string().min(1), ...impactBase }),
]);
export type PushImpactBody = z.input<typeof pushImpactBody>;

export const pushImpactView = z.object({
  recipients: z.number().describe('People who would get the notification.'),
  audience: z.number().describe('People the action concerns, with or without notifications on.'),
  overCap: z.number().describe('Recipients who already received the weekly limit or more.'),
  weeklyCap: z.number(),
  preview: z
    .object({ title: z.string(), body: z.string() })
    .describe('The notification as people will see it.'),
});
export type PushImpactView = z.infer<typeof pushImpactView>;

/** POST /api/admin/events/:id/announce */
export const pushAnnounced = z.object({
  recipients: z.number().describe('Notifications queued. They go out from 08:00 in Paris.'),
});
