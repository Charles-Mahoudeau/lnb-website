import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { event } from './events';

// Web Push to signed-in accounts, about events only. See docs/push.md.

export type PushKind = 'newEvent' | 'reminder' | 'spot' | 'cancelled' | 'rescheduled';
export type PushStatus = 'pending' | 'sent' | 'failed' | 'skipped';

/** One browser on one device that allowed notifications. Gone with the account. */
export const pushSubscription = pgTable(
  'push_subscription',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    p256dh: text('p256dh').notNull(),
    auth: text('auth').notNull(),
    // The language notifications are written in, kept up to date from the account page.
    locale: text('locale').default('en').notNull(),
    // A readable name from the user agent, such as "Chrome on Linux".
    device: text('device').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    lastSuccessAt: timestamp('last_success_at'),
  },
  (table) => [
    uniqueIndex('push_subscription_endpoint_uidx').on(table.endpoint),
    index('push_subscription_user_id_idx').on(table.userId),
    check('push_subscription_locale_check', sql`${table.locale} IN ('en', 'fr')`),
  ],
);

/** Which kinds of notification an account wants. No row: all of them. */
export const pushPreference = pgTable('push_preference', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  newEvents: boolean('new_events').default(true).notNull(),
  reminders: boolean('reminders').default(true).notNull(),
  spots: boolean('spots').default(true).notNull(),
  changes: boolean('changes').default(true).notNull(),
  updatedAt: timestamp('updated_at')
    .defaultNow()
    .$onUpdate(() => new Date())
    .notNull(),
});

/**
 * A notification for one account: queued, then sent to each of its devices by push:deliver. The
 * rows are also the log behind the weekly counts, and are pruned after 90 days.
 */
export const pushNotification = pgTable(
  'push_notification',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<PushKind>().notNull(),
    // Kept (set to null) if the event is deleted, so the weekly counts stay true.
    eventId: uuid('event_id').references(() => event.id, { onDelete: 'set null' }),
    // What the text needs besides the event, such as the reminder's offset in minutes.
    params: jsonb('params').$type<Record<string, unknown>>().default({}).notNull(),
    status: text('status').$type<PushStatus>().default('pending').notNull(),
    // Not before this time. A failed attempt moves it forward.
    sendAt: timestamp('send_at').defaultNow().notNull(),
    attempts: smallint('attempts').default(0).notNull(),
    lastError: text('last_error'),
    sentAt: timestamp('sent_at'),
    // Stops the same notification being queued twice, such as a reminder.
    dedupeKey: text('dedupe_key'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('push_notification_dedupe_key_uidx').on(table.dedupeKey),
    index('push_notification_due_idx')
      .on(table.sendAt)
      .where(sql`${table.status} = 'pending'`),
    index('push_notification_user_id_sent_at_idx').on(table.userId, table.sentAt),
    index('push_notification_event_id_idx').on(table.eventId),
    check(
      'push_notification_kind_check',
      sql`${table.kind} IN ('newEvent', 'reminder', 'spot', 'cancelled', 'rescheduled')`,
    ),
    check(
      'push_notification_status_check',
      sql`${table.status} IN ('pending', 'sent', 'failed', 'skipped')`,
    ),
  ],
);

/** The single row of admin settings. No row: the defaults below. */
export const pushSetting = pgTable(
  'push_setting',
  {
    id: smallint('id').primaryKey().default(1),
    // The notifications a person can receive in a week before an admin is warned. Never enforced.
    weeklyCap: smallint('weekly_cap').default(3).notNull(),
    // Days the prompt stays quiet on a device after "Not now". Null: never ask again.
    silenceDays: integer('silence_days').default(30),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check('push_setting_single_row', sql`${table.id} = 1`),
    check('push_setting_cap_check', sql`${table.weeklyCap} BETWEEN 1 AND 50`),
    check(
      'push_setting_silence_check',
      sql`${table.silenceDays} IS NULL OR ${table.silenceDays} IN (7, 30)`,
    ),
  ],
);
