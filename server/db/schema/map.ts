import { sql } from 'drizzle-orm';
import { check, pgTable, smallint, text } from 'drizzle-orm/pg-core';

/** Settings of the Minecraft map page, in a single row (id 1). No row means the default address. */
export const mapSetting = pgTable(
  'map_setting',
  {
    id: smallint('id').primaryKey().default(1),
    // The https address the page shows in a frame. Null means the default.
    url: text('url'),
  },
  (table) => [check('map_setting_single_row', sql`${table.id} = 1`)],
);
