import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

import { user } from './auth';

// The Minecraft mod list at /minecraft/mod-list. See docs/mods.md.

export type ModList = 'official' | 'suggestion';
export type ModStatus = 'visible' | 'removed';
export type ModSource = 'modrinth' | 'curseforge' | 'manual';
export type ModLoader = 'neoforge' | 'fabric' | 'forge' | 'quilt';

/** Global settings, in a single row (id 1). */
export const modListSettings = pgTable(
  'mod_list_settings',
  {
    id: smallint('id').primaryKey().default(1),
    // Voting and suggesting. When closed, the page stays visible but read-only.
    open: boolean('open').default(true).notNull(),
    maxSuggestions: smallint('max_suggestions').default(5).notNull(),
    // Mods are checked against these when they're added, not afterwards.
    gameVersion: text('game_version').default('1.21.1').notNull(),
    loader: text('loader').$type<ModLoader>().default('neoforge').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    updatedByUserId: text('updated_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [check('mod_list_settings_single_row', sql`${table.id} = 1`)],
);

/**
 * A mod, in one of the two tabs. A mod appears once across both, by its source project. Removed
 * suggestions are kept: they block the mod from being suggested again and still count toward
 * the proposer's limit. Withdrawn suggestions and removed official mods are deleted.
 */
export const mod = pgTable(
  'mod',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    list: text('list').$type<ModList>().notNull(),
    status: text('status').$type<ModStatus>().default('visible').notNull(),
    source: text('source').$type<ModSource>().notNull(),
    // The Modrinth or CurseForge project ID. Null for mods added by hand.
    sourceId: text('source_id'),
    // Stored once, when the mod is added.
    name: text('name').notNull(),
    summary: text('summary').default('').notNull(),
    pageUrl: text('page_url').notNull(),
    // The key in the mod-icons storage. Null when the mod has no icon.
    iconKey: text('icon_key'),
    // A deleted account leaves its suggestions, shown as "Former member".
    proposerUserId: text('proposer_user_id').references(() => user.id, { onDelete: 'set null' }),
    reason: text('reason'),
    removedReason: text('removed_reason'),
    removedAt: timestamp('removed_at'),
    removedByUserId: text('removed_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    // When the proposer dismissed the removal notice.
    removalSeenAt: timestamp('removal_seen_at'),
    promotedAt: timestamp('promoted_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    uniqueIndex('mod_source_source_id_uidx')
      .on(table.source, table.sourceId)
      .where(sql`${table.sourceId} IS NOT NULL`),
    index('mod_proposer_user_id_list_idx').on(table.proposerUserId, table.list),
    check('mod_list_check', sql`${table.list} IN ('official', 'suggestion')`),
    check('mod_status_check', sql`${table.status} IN ('visible', 'removed')`),
  ],
);

/** One vote per account and mod. Clearing a vote deletes the row. */
export const modVote = pgTable(
  'mod_vote',
  {
    modId: bigint('mod_id', { mode: 'number' })
      .notNull()
      .references(() => mod.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    value: smallint('value').notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.modId, table.userId] }),
    index('mod_vote_user_id_idx').on(table.userId),
    check('mod_vote_value_check', sql`${table.value} IN (-1, 1)`),
  ],
);
