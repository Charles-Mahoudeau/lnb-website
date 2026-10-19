import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';

// Events at /events, their rooms, types and registrations. See docs/events.md.

export type EventRegistrationStatus = 'registered' | 'waitlist';
export type EventBdeStatus = 'synced' | 'pending' | 'failed';

/** Where events happen. Archived once an event uses it, never deleted. */
export const eventRoom = pgTable(
  'event_room',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    // A campus or an address line, shown after the name.
    details: text('details'),
    archivedAt: timestamp('archived_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('event_room_name_uidx')
      .on(sql`lower(${table.name})`)
      .where(sql`${table.archivedAt} IS NULL`),
  ],
);

/** Kinds of events, such as Tournament. A name per UI language and a Lucide icon, no colour. */
export const eventType = pgTable(
  'event_type',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nameEn: text('name_en').notNull(),
    nameFr: text('name_fr').notNull(),
    // An Iconify name from the Lucide set, such as i-lucide-swords.
    icon: text('icon').notNull(),
    archivedAt: timestamp('archived_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('event_type_name_en_uidx')
      .on(sql`lower(${table.nameEn})`)
      .where(sql`${table.archivedAt} IS NULL`),
  ],
);

/**
 * An event. Its id is also the external_id on the BDE website. A hidden event is a draft: only
 * events managers see it. A cancelled event keeps its page, closed to registrations.
 */
export const event = pgTable(
  'event',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    // Markdown, rendered without raw HTML or images.
    description: text('description').notNull(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => eventRoom.id, { onDelete: 'restrict' }),
    typeId: uuid('type_id')
      .notNull()
      .references(() => eventType.id, { onDelete: 'restrict' }),
    // The Microsoft tenant IDs of the schools whose students can register.
    schools: text('schools').array().notNull(),
    startsAt: timestamp('starts_at').notNull(),
    endsAt: timestamp('ends_at').notNull(),
    // Null: no limit. Past the limit, registrations join the waitlist.
    capacity: integer('capacity'),
    // Null: open from publication, and until the start.
    registrationOpensAt: timestamp('registration_opens_at'),
    registrationClosesAt: timestamp('registration_closes_at'),
    // Whole euros, shown on the page only. Null: free.
    price: smallint('price'),
    hidden: boolean('hidden').default(true).notNull(),
    // Minutes before the start when registered people get a reminder. Empty: none.
    reminderOffsets: integer('reminder_offsets')
      .array()
      .default(sql`'{60}'::integer[]`)
      .notNull(),
    // When the new-event notification was sent. Null: not yet.
    announcedAt: timestamp('announced_at'),
    cancelledAt: timestamp('cancelled_at'),

    // Images, as keys in the event-images storage: the picked originals, where to crop them
    // (0 to 1 from the top left), and the crops made from them.
    bannerKey: text('banner_key'),
    bannerFocusX: real('banner_focus_x').default(0.5).notNull(),
    bannerFocusY: real('banner_focus_y').default(0.5).notNull(),
    // Null: the embed is cropped from the banner.
    embedKey: text('embed_key'),
    embedFocusX: real('embed_focus_x').default(0.5).notNull(),
    embedFocusY: real('embed_focus_y').default(0.5).notNull(),
    bannerCropKey: text('banner_crop_key'),
    thumbCropKey: text('thumb_crop_key'),
    embedCropKey: text('embed_crop_key'),

    // The push to the BDE website. See docs/bde/external_events_api.md.
    bdeSync: boolean('bde_sync').default(false).notNull(),
    // Null: never pushed, or deleted there.
    bdeStatus: text('bde_status').$type<EventBdeStatus>(),
    bdeAttempts: smallint('bde_attempts').default(0).notNull(),
    bdeNextAttemptAt: timestamp('bde_next_attempt_at'),
    bdeLastError: jsonb('bde_last_error').$type<Record<string, unknown>>(),
    bdePageUrl: text('bde_page_url'),

    createdByUserId: text('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('event_starts_at_idx').on(table.startsAt),
    index('event_bde_next_attempt_at_idx')
      .on(table.bdeNextAttemptAt)
      .where(sql`${table.bdeStatus} = 'pending'`),
    check('event_ends_after_start', sql`${table.endsAt} > ${table.startsAt}`),
    check('event_schools_not_empty', sql`cardinality(${table.schools}) > 0`),
    check('event_capacity_positive', sql`${table.capacity} IS NULL OR ${table.capacity} > 0`),
    check('event_price_not_negative', sql`${table.price} IS NULL OR ${table.price} >= 0`),
    check(
      'event_bde_status_check',
      sql`${table.bdeStatus} IS NULL OR ${table.bdeStatus} IN ('synced', 'pending', 'failed')`,
    ),
  ],
);

/**
 * One account on one event. The waitlist is in order of creation. Rows go with the account: a
 * deleted account frees its place.
 */
export const eventRegistration = pgTable(
  'event_registration',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    eventId: uuid('event_id')
      .notNull()
      .references(() => event.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    status: text('status').$type<EventRegistrationStatus>().notNull(),
    // The manager who added this account by hand. Null when the account registered itself.
    addedByUserId: text('added_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('event_registration_event_id_user_id_uidx').on(table.eventId, table.userId),
    index('event_registration_event_id_status_idx').on(table.eventId, table.status, table.id),
    index('event_registration_user_id_idx').on(table.userId),
    check('event_registration_status_check', sql`${table.status} IN ('registered', 'waitlist')`),
  ],
);
