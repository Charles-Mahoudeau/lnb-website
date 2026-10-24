import { sql } from 'drizzle-orm';
import { check, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { event } from './events';
import { shortLink } from './short-links';
import type { PosterContent } from '../../../shared/schemas/posters';
import type { PosterOverrides } from '../../../shared/utils/posters';

// Posters made in the admin area, for events or on their own. See docs/posters.md.

/**
 * A saved poster. Event fields follow `eventId` unless pinned in `overrides`. When the event is
 * deleted, the poster keeps what it showed: the values are written into `overrides` first.
 */
export const poster = pgTable(
  'poster',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    eventId: uuid('event_id').references(() => event.id, { onDelete: 'set null' }),
    // One of POSTER_TEMPLATES (shared/utils/posters.ts).
    template: text('template').notNull(),
    // One of POSTER_TREATMENTS, Art title only. Null: the art as it is.
    treatment: text('treatment'),
    locale: text('locale').notNull().default('fr'),
    overrides: jsonb('overrides').$type<PosterOverrides>().default({}).notNull(),
    content: jsonb('content').$type<PosterContent>().notNull(),
    // The treated art, a key in the event-images storage. Null without a treatment.
    treatedKey: text('treated_key'),
    // The QR code's link. Kept when the poster is deleted, and shared by its duplicates.
    shortLinkId: uuid('short_link_id').references(() => shortLink.id, { onDelete: 'set null' }),
    createdBy: text('created_by').references(() => user.id, { onDelete: 'set null' }),
    updatedBy: text('updated_by').references(() => user.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    index('poster_event_id_idx').on(table.eventId),
    check(
      'poster_template',
      sql`${table.template} in ('banner', 'artTitle', 'ticket', 'labels', 'collage', 'badge')`,
    ),
    check(
      'poster_treatment',
      sql`${table.treatment} is null or (${table.template} = 'artTitle' and ${table.treatment} in ('duotone', 'darkMedium', 'darkStrong'))`,
    ),
    check('poster_locale', sql`${table.locale} in ('fr', 'en')`),
  ],
);
