import { bigint, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth';

// The Files library at /admin/modpack/files. See docs/files.md.

/**
 * A file uploaded by an admin, kept on the VPS's disk under its SHA-256 (`.data/files/<sha256>`).
 * The bytes are never changed, so a row only ever gets deleted, with its file.
 */
export const storedFile = pgTable(
  'stored_file',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The same bytes are stored once.
    sha256: text('sha256').notNull().unique(),
    sha512: text('sha512').notNull(),
    name: text('name').notNull(),
    // One of FILE_KINDS (shared/schemas/files.ts).
    kind: text('kind').notNull(),
    size: bigint('size', { mode: 'number' }).notNull(),
    uploadedByUserId: text('uploaded_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('stored_file_kind_created_at_idx').on(table.kind, table.createdAt)],
);
