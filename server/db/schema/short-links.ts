import { sql } from 'drizzle-orm';
import {
  bigserial,
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';

// The short links at /r/:shortId. See docs/short-links.md.

/** A short link. `access` is one of LINK_ACCESS (shared/schemas/short-links.ts). */
export const shortLink = pgTable(
  'short_link',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // The path after /r/, lowercase and unique.
    shortId: text('short_id').notNull().unique(),
    // Only admins see it.
    name: text('name').notNull(),
    destinationUrl: text('destination_url').notNull(),
    access: text('access').notNull().default('any'),
    // Microsoft tenant IDs of the schools allowed when `access` is 'schools'.
    tenantIds: text('tenant_ids')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    // Keeps who clicked. Only for links that need sign-in.
    recordClicks: boolean('record_clicks').notNull().default(false),
    enabled: boolean('enabled').notNull().default(true),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
  },
  (table) => [
    check('short_link_access', sql`${table.access} in ('any', 'signed', 'schools')`),
    check(
      'short_link_schools',
      sql`${table.access} <> 'schools' or cardinality(${table.tenantIds}) > 0`,
    ),
    check('short_link_record', sql`not ${table.recordClicks} or ${table.access} <> 'any'`),
  ],
);

/**
 * One time a link was followed (outcome 'opened') or refused for the wrong school
 * ('wrongSchool'). `userId` and `tenantId` are set only when the link records clicks, and an
 * account's deletion keeps the click but forgets who it was.
 */
export const shortLinkClick = pgTable(
  'short_link_click',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    linkId: uuid('link_id')
      .notNull()
      .references(() => shortLink.id, { onDelete: 'cascade' }),
    at: timestamp('at').defaultNow().notNull(),
    outcome: text('outcome').notNull().default('opened'),
    signedIn: boolean('signed_in').notNull().default(false),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    tenantId: text('tenant_id'),
  },
  (table) => [
    index('short_link_click_link_idx').on(table.linkId, table.at),
    index('short_link_click_user_idx').on(table.userId),
  ],
);
