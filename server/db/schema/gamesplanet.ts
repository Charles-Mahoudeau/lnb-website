import { sql } from 'drizzle-orm';
import {
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  boolean,
} from 'drizzle-orm/pg-core';

// The Gamesplanet affiliate promotion. See docs/gamesplanet.md.

/** Settings of the promotion, in a single row (id 1). No row means the defaults. */
export const gamesplanetSetting = pgTable(
  'gamesplanet_setting',
  {
    id: smallint('id').primaryKey().default(1),
    // The affiliate ref added to every link to Gamesplanet.
    refCode: text('ref_code').default('teknantes').notNull(),
    // The ETag of the last answer of each feed, so an unchanged feed isn't read again.
    catalogEtag: text('catalog_etag'),
    chartsEtag: text('charts_etag'),
    flashEtag: text('flash_etag'),
    // The last time each read finished without an error, for the admin page.
    catalogSyncedAt: timestamp('catalog_synced_at'),
    dealsSyncedAt: timestamp('deals_synced_at'),
  },
  (table) => [check('gamesplanet_setting_single_row', sql`${table.id} = 1`)],
);

/** A game from Gamesplanet's catalog, kept compact (no description). Prices are in euro cents. */
export const gamesplanetGame = pgTable(
  'gamesplanet_game',
  {
    // Gamesplanet's id, such as "8822-1".
    uid: text('uid').primaryKey(),
    name: text('name').notNull(),
    publisher: text('publisher'),
    category: text('category'),
    priceCents: integer('price_cents').notNull(),
    basePriceCents: integer('base_price_cents').notNull(),
    steamId: text('steam_id'),
    pegi: smallint('pegi'),
    // The game page, without a query string. The ref is added when a link is shown.
    url: text('url').notNull(),
    // The source image links on Gamesplanet's servers. They are never shown: only our copies are.
    packshotUrl: text('packshot_url'),
    teaserUrl: text('teaser_url'),
    // Our copies, as file names in the gamesplanet-covers storage. Null until downloaded.
    packshotKey: text('packshot_key'),
    teaserKey: text('teaser_key'),
    availableInFrance: boolean('available_in_france').default(true).notNull(),
    // The place in Gamesplanet's best sellers (1 is first), or null when not in the list.
    chartRank: integer('chart_rank'),
    // When the flash price ends, or null when the game isn't in flash.
    flashEndsAt: timestamp('flash_ends_at'),
    // The last time any feed listed the game. Games unseen for two weeks are removed.
    seenAt: timestamp('seen_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    index('gamesplanet_game_chart_idx').on(table.chartRank),
    index('gamesplanet_game_steam_idx').on(table.steamId),
    index('gamesplanet_game_name_idx').on(sql`lower(${table.name})`),
  ],
);

/** Games admins put first on the partners band and the home card, in order. At most three. */
export const gamesplanetPin = pgTable('gamesplanet_pin', {
  uid: text('uid')
    .primaryKey()
    .references(() => gamesplanetGame.uid, { onDelete: 'cascade' }),
  position: integer('position').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});
