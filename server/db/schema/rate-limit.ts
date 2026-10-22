import { pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth';

// A single row, `default`. No row means the normal mode. The modes are in shared/rate-limit.ts.
export const rateLimitSetting = pgTable('rate_limit_setting', {
  id: text('id').primaryKey(),
  mode: text('mode').notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
  updatedByUserId: text('updated_by_user_id').references(() => user.id, { onDelete: 'set null' }),
});
