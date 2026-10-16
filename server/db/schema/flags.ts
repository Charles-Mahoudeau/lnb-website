import { boolean, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth';

// Only the flags an admin changed have a row. Which flags exist, and that they default to on,
// is in shared/flags.ts.
export const featureFlag = pgTable('feature_flag', {
  key: text('key').primaryKey(),
  enabled: boolean('enabled').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  updatedByUserId: text('updated_by_user_id').references(() => user.id, { onDelete: 'set null' }),
});
