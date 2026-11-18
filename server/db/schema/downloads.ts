import { sql } from 'drizzle-orm';
import { check, pgTable, smallint, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { storedFile } from './files';

// The files the Minecraft download page offers from the Files library. See docs/downloads.md.

/**
 * One row per slot of the page that holds a library file (`DOWNLOAD_SLOTS`,
 * shared/schemas/downloads.ts): the LNB instance zip, and PrismCracked for each system. No row
 * means nothing is offered there yet. A file a slot points at can't be deleted from the library.
 */
export const downloadFile = pgTable('download_file', {
  slot: text('slot').primaryKey(),
  fileId: uuid('file_id')
    .notNull()
    .references(() => storedFile.id, { onDelete: 'restrict' }),
  // A label for people, such as "1.4.0". Optional.
  version: text('version'),
  updatedByUserId: text('updated_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/** Settings of the download page, in a single row (id 1). No row means no release link. */
export const downloadSetting = pgTable(
  'download_setting',
  {
    id: smallint('id').primaryKey().default(1),
    // The https page of PrismCracked's releases, shown beside its downloads. Null: no link.
    crackedReleaseUrl: text('cracked_release_url'),
  },
  (table) => [check('download_setting_single_row', sql`${table.id} = 1`)],
);
