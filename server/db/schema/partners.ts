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
  uuid,
} from 'drizzle-orm/pg-core';

// The partners page at /partners. See docs/partners.md.

/** A company or studio that helps LNB. `kind` is one of PARTNER_KINDS (shared/schemas/partners.ts). */
export const partner = pgTable(
  'partner',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').notNull(),
    name: text('name').notNull(),
    descriptionEn: text('description_en').notNull(),
    // Left empty, the English text shows in French too.
    descriptionFr: text('description_fr').default('').notNull(),
    // An https link, or null for none.
    url: text('url'),
    // The stored logo's file name in the partner-logos storage, served by /api/partners/logos.
    logoKey: text('logo_key').notNull(),
    position: integer('position').notNull(),
    visible: boolean('visible').default(true).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('partner_kind_idx').on(table.kind, table.position)],
);

/** Settings of the page, in a single row (id 1). No row means the defaults. */
export const partnerSetting = pgTable(
  'partner_setting',
  {
    id: smallint('id').primaryKey().default(1),
    // Where "Get in touch" leads: an https link or a mailto: address. Null hides the band.
    contactUrl: text('contact_url'),
  },
  (table) => [check('partner_setting_single_row', sql`${table.id} = 1`)],
);
