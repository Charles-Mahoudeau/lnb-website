import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  date,
  index,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
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
  // Set when a manager sent the push announcement. It goes out once.
  announcedAt: timestamp('announced_at'),
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
    // The LNB or BDE referent the organizer's spreadsheet asks for (its Manager sheet). Not shown
    // to players. `referent_role` is 'Manager' or 'Manager / Joueur'.
    referentPseudo: text('referent_pseudo').default('').notNull(),
    referentEmail: text('referent_email').default('').notNull(),
    referentBirthDate: date('referent_birth_date', { mode: 'string' }),
    referentRole: text('referent_role').default('Manager').notNull(),
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

/**
 * A team of a game. Its name and abbreviation are unique within the game (`name_key` and
 * `abbreviation` are set by the service: accents and case ignored, capitals). The captain is
 * always a starter.
 */
export const partnerEventTeam = pgTable(
  'partner_event_team',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    gameId: uuid('game_id')
      .notNull()
      .references(() => partnerEventGame.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    nameKey: text('name_key').notNull(),
    abbreviation: text('abbreviation').notNull(),
    captainUserId: text('captain_user_id').references(() => user.id, { onDelete: 'set null' }),
    acceptsRequests: boolean('accepts_requests').default(true).notNull(),
    // A referent for this team alone, replacing the game's in the export. Null uses the game's.
    referentPseudo: text('referent_pseudo'),
    referentEmail: text('referent_email'),
    referentBirthDate: date('referent_birth_date', { mode: 'string' }),
    referentRole: text('referent_role'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('partner_event_team_name_uidx').on(table.gameId, table.nameKey),
    uniqueIndex('partner_event_team_abbreviation_uidx').on(table.gameId, table.abbreviation),
  ],
);

/**
 * A player in a team. `game_id` repeats the team's game so one student can only be in one team
 * per game. The date of birth is asked when creating or joining a team, for the organizer.
 */
export const partnerEventTeamMember = pgTable(
  'partner_event_team_member',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => partnerEventTeam.id, { onDelete: 'cascade' }),
    gameId: uuid('game_id')
      .notNull()
      .references(() => partnerEventGame.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').notNull().default('starter'),
    birthDate: date('birth_date', { mode: 'string' }).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    unique('partner_event_team_member_game_user').on(table.gameId, table.userId),
    index('partner_event_team_member_team_idx').on(table.teamId),
    check('partner_event_team_member_role', sql`${table.role} in ('starter', 'substitute')`),
  ],
);

/** An invitation from a captain to a student, or a student's request to join. One pending row per pair. */
export const partnerEventTeamInvite = pgTable(
  'partner_event_team_invite',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    teamId: uuid('team_id')
      .notNull()
      .references(() => partnerEventTeam.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').notNull(),
    // A request carries the student's date of birth, used if the captain accepts.
    birthDate: date('birth_date', { mode: 'string' }),
    status: text('status').notNull().default('pending'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    resolvedAt: timestamp('resolved_at'),
  },
  (table) => [
    uniqueIndex('partner_event_team_invite_pending_uidx')
      .on(table.teamId, table.userId)
      .where(sql`${table.status} = 'pending'`),
    index('partner_event_team_invite_user_idx').on(table.userId),
    check('partner_event_team_invite_kind', sql`${table.kind} in ('invite', 'request')`),
    check(
      'partner_event_team_invite_status',
      sql`${table.status} in ('pending', 'accepted', 'declined', 'cancelled')`,
    ),
  ],
);
