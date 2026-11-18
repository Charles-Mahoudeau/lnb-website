import { pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

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
