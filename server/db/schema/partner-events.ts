import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';

// Pages for events another organization runs, under /special/<slug>. See docs/partner-events.md.

/** A partner event: its links, its date wording and its switches. The texts are in i18n. */
export const partnerEvent = pgTable('partner_event', {
  id: uuid('id').primaryKey().defaultRandom(),
  // The path after /special/, lowercase and unique.
  slug: text('slug').notNull().unique(),
  // https links to the organizer's website and Discord, or null for none.
  websiteUrl: text('website_url'),
  discordUrl: text('discord_url'),
  // The hero art: a file in the event-images storage (served by /api/media), or null for the
  // tinted fallback.
  heroKey: text('hero_key'),
  // The date as the organizer gave it, in both languages. Empty means "not fixed".
  dateTextEn: text('date_text_en').default('').notNull(),
  dateTextFr: text('date_text_fr').default('').notNull(),
  dateConfirmed: boolean('date_confirmed').default(false).notNull(),
  // Admin switches: saving interest, and creating or joining teams.
  interestOpen: boolean('interest_open').default(true).notNull(),
  teamsOpen: boolean('teams_open').default(true).notNull(),
  // Set by "Close event": the page turns read-only and the data is purged later.
  closedAt: timestamp('closed_at'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/** A game of a partner event. `key` is one of PARTNER_GAME_KEYS, `status` of PARTNER_GAME_STATUSES. */
export const partnerEventGame = pgTable(
  'partner_event_game',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    partnerEventId: uuid('partner_event_id')
      .notNull()
      .references(() => partnerEvent.id, { onDelete: 'cascade' }),
    key: text('key').notNull(),
    // 'confirmed' games take teams, 'study' games only interest.
    status: text('status').notNull().default('study'),
    // Players on the field, and how many substitutes a team may add.
    starters: smallint('starters').notNull(),
    substitutes: smallint('substitutes').notNull().default(2),
    position: smallint('position').notNull(),
    // The card art: a file in the event-images storage, or null for the tinted fallback.
    artKey: text('art_key'),
  },
  (table) => [
    unique('partner_event_game_key').on(table.partnerEventId, table.key),
    check('partner_event_game_status', sql`${table.status} in ('confirmed', 'study')`),
    check('partner_event_game_starters', sql`${table.starters} between 1 and 16`),
    check('partner_event_game_substitutes', sql`${table.substitutes} between 0 and 8`),
  ],
);

/** A student's interest in a game, with what the organizer receives. */
export const partnerEventInterest = pgTable(
  'partner_event_interest',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => partnerEventGame.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    inGameName: text('in_game_name').default('').notNull(),
    rank: text('rank').default('').notNull(),
    // Leaves the looking-for-a-team list (slice 2).
    hidden: boolean('hidden').default(false).notNull(),
    // When the student agreed to share the data with the organizer.
    consentedAt: timestamp('consented_at').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [unique('partner_event_interest_user').on(table.gameId, table.userId)],
);
