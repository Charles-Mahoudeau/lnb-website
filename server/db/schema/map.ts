import { sql } from 'drizzle-orm';
import { check, pgTable, smallint, text, timestamp } from 'drizzle-orm/pg-core';

/** Settings of the Minecraft map page, in a single row (id 1). No row means the default address. */
export const mapSetting = pgTable(
  'map_setting',
  {
    id: smallint('id').primaryKey().default(1),
    // The https address the page shows in a frame. Null means the default.
    url: text('url'),
    // Who can see the map: everyone ('open'), everyone from `opensAt` ('date') or only admins
    // until an admin opens it ('closed').
    mode: text('mode', { enum: ['open', 'date', 'closed'] })
      .notNull()
      .default('open'),
    opensAt: timestamp('opens_at'),
    // When the map was last closed, so the wait page can show how far along it is.
    lockedAt: timestamp('locked_at'),
  },
  (table) => [check('map_setting_single_row', sql`${table.id} = 1`)],
);
