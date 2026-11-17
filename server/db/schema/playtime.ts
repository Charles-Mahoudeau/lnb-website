import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { event } from './events';
import { minecraftAccount, wardenSession } from './warden';
import type { PlaytimeMode, PlaytimeSchedule } from '../../../shared/schemas/playtime';

// The weekly playtime limit. See docs/playtime.md. Timestamps are UTC, and a week is identified by
// its Monday in Paris, as a date.

/** The global rules, in a single row (id 1). */
export const playtimeSettings = pgTable(
  'playtime_settings',
  {
    id: smallint('id').primaryKey().default(1),
    // `off` stops everything, `observe` counts and shows without denying or kicking.
    mode: text('mode').$type<PlaytimeMode>().default('observe').notNull(),
    allowanceSeconds: integer('allowance_seconds').default(36_000).notNull(),
    schedule: jsonb('schedule').$type<PlaytimeSchedule>().notNull(),
    // Zero switches the grace period off.
    graceSeconds: integer('grace_seconds').default(3600).notNull(),
    warningsMinutes: jsonb('warnings_minutes').$type<number[]>().notNull(),
    startWarningsMinutes: jsonb('start_warnings_minutes').$type<number[]>().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    updatedByUserId: text('updated_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    check('playtime_settings_single_row', sql`${table.id} = 1`),
    check('playtime_settings_mode_check', sql`${table.mode} IN ('off', 'observe', 'enforce')`),
  ],
);

/** A school's overrides, by Microsoft tenant ID. A null field inherits the global value. */
export const playtimeSchool = pgTable('playtime_school', {
  tenantId: text('tenant_id').primaryKey(),
  allowanceSeconds: integer('allowance_seconds'),
  schedule: jsonb('schedule').$type<PlaytimeSchedule>(),
  graceSeconds: integer('grace_seconds'),
  warningsMinutes: jsonb('warnings_minutes').$type<number[]>(),
  startWarningsMinutes: jsonb('start_warnings_minutes').$type<number[]>(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  updatedByUserId: text('updated_by_user_id').references(() => user.id, { onDelete: 'set null' }),
});

/**
 * A stretch where nothing counts, for everyone or for some schools. Dates are Paris dates, both
 * inclusive. A closure made for an event is kept in step with it and isn't edited by hand.
 */
export const playtimeClosure = pgTable(
  'playtime_closure',
  {
    id: serial('id').primaryKey(),
    label: text('label').notNull(),
    startsOn: date('starts_on', { mode: 'string' }).notNull(),
    endsOn: date('ends_on', { mode: 'string' }).notNull(),
    // Null means every school.
    tenantIds: text('tenant_ids').array(),
    eventId: uuid('event_id').references(() => event.id, { onDelete: 'cascade' }),
    // `registered` players of the event, or `everyone`. Null without an event.
    eventScope: text('event_scope').$type<'registered' | 'everyone'>(),
    createdByUserId: text('created_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    check('playtime_closure_dates_check', sql`${table.endsOn} >= ${table.startsOn}`),
    check(
      'playtime_closure_event_scope_check',
      sql`(${table.eventId} IS NULL) = (${table.eventScope} IS NULL)`,
    ),
    index('playtime_closure_dates_idx').on(table.startsOn, table.endsOn),
  ],
);

/**
 * Takes an LNB account, or one Minecraft account, out of the limit. Active means not revoked and
 * not past `until`. The player sees "Exempt" and never the reason.
 */
export const playtimeExemption = pgTable(
  'playtime_exemption',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    minecraftUuid: uuid('minecraft_uuid').references(() => minecraftAccount.uuid, {
      onDelete: 'cascade',
    }),
    reason: text('reason').notNull(),
    until: timestamp('until'),
    setByUserId: text('set_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    revokedAt: timestamp('revoked_at'),
  },
  (table) => [
    check(
      'playtime_exemption_target_check',
      sql`(${table.userId} IS NULL) <> (${table.minecraftUuid} IS NULL)`,
    ),
    index('playtime_exemption_user_id_idx').on(table.userId),
    index('playtime_exemption_minecraft_uuid_idx').on(table.minecraftUuid),
  ],
);

/** Extra time for one player's week. It ends with the week, and is capped at 5 hours each. */
export const playtimeGrant = pgTable(
  'playtime_grant',
  {
    id: serial('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    seconds: integer('seconds').notNull(),
    reason: text('reason').notNull(),
    grantedByUserId: text('granted_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    revokedAt: timestamp('revoked_at'),
  },
  (table) => [
    check('playtime_grant_seconds_check', sql`${table.seconds} BETWEEN 1 AND 18000`),
    index('playtime_grant_user_week_idx').on(table.userId, table.weekStart),
  ],
);

/**
 * What a session played in a week, by what it counted as. Written as time passes and never
 * recounted. A session across Monday 00:00 has two rows. `userId` and `minecraftUuid` are copied
 * from the session, so a week's total needs no join.
 */
export const playtimeLedger = pgTable(
  'playtime_ledger',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => wardenSession.id, { onDelete: 'cascade' }),
    weekStart: date('week_start', { mode: 'string' }).notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    minecraftUuid: uuid('minecraft_uuid')
      .notNull()
      .references(() => minecraftAccount.uuid, { onDelete: 'cascade' }),
    // Time in a restricted window, against the allowance.
    countedSeconds: integer('counted_seconds').default(0).notNull(),
    // Time at the end of a window, after the allowance ran out, that wasn't counted.
    graceSeconds: integer('grace_seconds').default(0).notNull(),
    // Time with no allowance left and no grace. Only in `observe`, or before a kick lands.
    overSeconds: integer('over_seconds').default(0).notNull(),
    // Time outside the windows, or of an exempt account, or with no limit.
    freeSeconds: integer('free_seconds').default(0).notNull(),
    // The instant up to which this row has counted the session.
    countedUntil: timestamp('counted_until').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sessionId, table.weekStart] }),
    index('playtime_ledger_user_week_idx').on(table.userId, table.weekStart),
    index('playtime_ledger_week_idx').on(table.weekStart),
  ],
);

/** A warning already sent for a session, so each goes once. Kinds are `w30`, `start5` and so on. */
export const playtimeNotice = pgTable(
  'playtime_notice',
  {
    sessionId: uuid('session_id')
      .notNull()
      .references(() => wardenSession.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.sessionId, table.kind] })],
);
