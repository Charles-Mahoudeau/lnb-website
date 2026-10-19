import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';

// The team page at /team. See docs/team.md.

/** A group of the team, such as the bureau. At most one is featured: it gets the large band. */
export const teamPole = pgTable(
  'team_pole',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    nameEn: text('name_en').notNull(),
    nameFr: text('name_fr').notNull(),
    descriptionEn: text('description_en').default('').notNull(),
    descriptionFr: text('description_fr').default('').notNull(),
    // A full Lucide class from TEAM_ICONS, such as `i-lucide-calendar`.
    icon: text('icon').notNull(),
    featured: boolean('featured').default(false).notNull(),
    position: integer('position').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('team_pole_featured_uidx')
      .on(table.featured)
      .where(sql`featured`),
  ],
);

/**
 * An account shown on the team page, in one pole. Name, photo and school come from the account.
 * Gone with the account. `visible` is the managers' switch, `showSelf` the member's own.
 */
export const teamMember = pgTable(
  'team_member',
  {
    userId: text('user_id')
      .primaryKey()
      .references(() => user.id, { onDelete: 'cascade' }),
    poleId: uuid('pole_id')
      .notNull()
      .references(() => teamPole.id, { onDelete: 'restrict' }),
    roleEn: text('role_en').notNull(),
    roleFr: text('role_fr').notNull(),
    bioEn: text('bio_en').default('').notNull(),
    bioFr: text('bio_fr').default('').notNull(),
    position: integer('position').notNull(),
    visible: boolean('visible').default(true).notNull(),
    showSelf: boolean('show_self').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('team_member_pole_id_idx').on(table.poleId, table.position)],
);

/** Settings of the page, in a single row (id 1). No row means the defaults. */
export const teamSetting = pgTable(
  'team_setting',
  {
    id: smallint('id').primaryKey().default(1),
    // Where "Join the team" leads. Null hides the button.
    joinUrl: text('join_url'),
  },
  (table) => [check('team_setting_single_row', sql`${table.id} = 1`)],
);
