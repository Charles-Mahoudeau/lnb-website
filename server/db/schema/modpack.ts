import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { storedFile } from './files';
import { mod } from './mods';

// The Modlist at /admin/modpack/modlist: the launcher's modpack, apart from the mod vote. See docs/modpack.md.

/** The manifest's revision, in a single row (id 1). Goes up with every change a launcher can see. */
export const modpackState = pgTable(
  'modpack_state',
  {
    id: smallint('id').primaryKey().default(1),
    revision: integer('revision').default(1).notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [check('modpack_state_single_row', sql`${table.id} = 1`)],
);

/**
 * A mod of the pack. Its pinned file is the one the manifest lists: an admin changes it, never a
 * job. The `latest` columns are what the nightly check found, shown as an update badge.
 */
export const modpackMod = pgTable(
  'modpack_mod',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // One of MODPACK_SOURCES (shared/schemas/modpack.ts).
    source: text('source').notNull(),
    // The Modrinth or CurseForge project ID. Null for custom links and uploaded files.
    sourceId: text('source_id'),
    // The entry of the mod vote it was exported from, if any.
    voteModId: bigint('vote_mod_id', { mode: 'number' }).references(() => mod.id, {
      onDelete: 'set null',
    }),
    name: text('name').notNull(),
    summary: text('summary').default('').notNull(),
    pageUrl: text('page_url'),
    // The key in the mod-icons storage.
    iconKey: text('icon_key'),
    side: text('side').default('both').notNull(),
    optional: boolean('optional').default(false).notNull(),
    // Why the mod is out of the manifest. One of MODPACK_ATTENTIONS, or null.
    attention: text('attention'),

    pinnedVersion: text('pinned_version'),
    pinnedFileName: text('pinned_file_name'),
    // Where it downloads from. Null for a Files library file: the manifest uses this site's address.
    pinnedUrl: text('pinned_url'),
    pinnedSha256: text('pinned_sha256'),
    pinnedSha512: text('pinned_sha512'),
    pinnedSize: bigint('pinned_size', { mode: 'number' }),
    // A file in use can't be deleted from the library.
    pinnedFileId: uuid('pinned_file_id').references(() => storedFile.id, { onDelete: 'restrict' }),

    latestVersion: text('latest_version'),
    latestFileName: text('latest_file_name'),
    latestUrl: text('latest_url'),
    latestSha256: text('latest_sha256'),
    latestSha512: text('latest_sha512'),
    latestSize: bigint('latest_size', { mode: 'number' }),
    latestCheckedAt: timestamp('latest_checked_at'),

    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    // A project is in the pack once.
    uniqueIndex('modpack_mod_source_source_id_uidx')
      .on(table.source, table.sourceId)
      .where(sql`${table.sourceId} IS NOT NULL`),
  ],
);

/**
 * The launcher's own tools, each pointing at the Files library jar that is current. Publishing
 * another file raises the manifest's revision. A file in use can't be deleted from the library.
 */
export const modpackTool = pgTable('modpack_tool', {
  // One of MODPACK_TOOLS (shared/schemas/modpack.ts).
  tool: text('tool').primaryKey(),
  fileId: uuid('file_id')
    .notNull()
    .references(() => storedFile.id, { onDelete: 'restrict' }),
  version: text('version').notNull(),
  notes: text('notes').default('').notNull(),
  publishedAt: timestamp('published_at').defaultNow().notNull(),
  publishedByUserId: text('published_by_user_id').references(() => user.id, {
    onDelete: 'set null',
  }),
});

/**
 * A file launchers delete from a player's mods folder even though the updater never wrote it:
 * what was removed before the updater kept a journal. A name always matches; a hash, when set,
 * makes the match exact. Added by hand or when a mod leaves the Modlist. See docs/modpack.md.
 */
export const modpackRetired = pgTable(
  'modpack_retired',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    fileName: text('file_name').notNull(),
    // Lowercase hex, 128 characters. Null: the match is by name only.
    sha512: text('sha512'),
    // For the team. Never in the manifest.
    note: text('note').default('').notNull(),
    addedByUserId: text('added_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [uniqueIndex('modpack_retired_file_name_uidx').on(table.fileName)],
);
