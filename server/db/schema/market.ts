import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  smallint,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { economyAccount, economyTransaction } from './economy';

// The Market: the server's own shop, where prices follow the stock. See docs/market.md.
// Money is bigint cents. Prices, stocks and windows are numeric(20,6) read as numbers: prices per
// item can be below a cent, and only an order's total is rounded.

const quantity = (name: string) => numeric(name, { precision: 20, scale: 6, mode: 'number' });

export type MarketDirection = 'sell' | 'buy';

/** An item the Market trades: its curve and its stock. Never deleted, only turned off. */
export const marketItem = pgTable(
  'market_item',
  {
    // The Minecraft registry ID (`minecraft:cobblestone`).
    id: text('id').primaryKey(),
    tier: smallint('tier').notNull(),
    enabled: boolean('enabled').default(true).notNull(),
    sellable: boolean('sellable').default(true).notNull(),
    buyable: boolean('buyable').default(false).notNull(),
    p0: quantity('p0').notNull(),
    pMin: quantity('p_min').notNull(),
    pMax: quantity('p_max').notNull(),
    s0: quantity('s0').notNull(),
    sMin: quantity('s_min').notNull(),
    sMax: quantity('s_max').notNull(),
    k: quantity('k').notNull(),
    alpha: quantity('alpha').notNull(),
    // The stock when it was last written, and when: the drift since is applied on every read.
    stock: quantity('stock').notNull(),
    stockAt: timestamp('stock_at').defaultNow().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [
    check('market_item_tier', sql`${table.tier} between 1 and 3`),
    check(
      'market_item_prices',
      sql`${table.pMin} > 0 and ${table.pMin} <= ${table.p0} and ${table.p0} <= ${table.pMax}`,
    ),
    check(
      'market_item_stocks',
      sql`${table.sMin} > 0 and ${table.sMin} <= ${table.s0} and ${table.s0} <= ${table.sMax}`,
    ),
    check('market_item_shape', sql`${table.k} > 0 and ${table.alpha} >= 0 and ${table.alpha} <= 1`),
  ],
);

/** What an item's parameters were before a change, for the admin's history. */
export const marketItemVersion = pgTable(
  'market_item_version',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => marketItem.id),
    // The parameters as saved (tier, flags, p0 to alpha), right after the change.
    parameters: jsonb('parameters').$type<Record<string, unknown>>().notNull(),
    changedByUserId: text('changed_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('market_item_version_item_idx').on(table.itemId, table.id)],
);

/** Global settings, in a single row (id 1). `revision` grows with every change of the config. */
export const marketSettings = pgTable(
  'market_settings',
  {
    id: smallint('id').primaryKey().default(1),
    // The spread σ, in percent.
    sigmaPercent: quantity('sigma_percent').default(15).notNull(),
    tolerancePercent: quantity('tolerance_percent').default(1).notNull(),
    maxOrderItems: integer('max_order_items').default(2304).notNull(),
    // The 30-day mint budget, in percent of the money in circulation.
    mintCapPercent: quantity('mint_cap_percent').default(25).notNull(),
    historyDays: integer('history_days').default(365).notNull(),
    revision: integer('revision').default(1).notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    updatedByUserId: text('updated_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [check('market_settings_single_row', sql`${table.id} = 1`)],
);

/** The diminishing-return window of a tier: thresholds in cents of nominal value, and the rates. */
export const marketTierSettings = pgTable(
  'market_tier_settings',
  {
    tier: smallint('tier').primaryKey(),
    q1: bigint('q1', { mode: 'number' }).notNull(),
    q2: bigint('q2', { mode: 'number' }).notNull(),
    midPercent: smallint('mid_percent').notNull(),
    tailPercent: smallint('tail_percent').notNull(),
  },
  (table) => [
    check('market_tier_settings_tier', sql`${table.tier} between 1 and 3`),
    check('market_tier_settings_thresholds', sql`${table.q1} > 0 and ${table.q1} < ${table.q2}`),
  ],
);

/** One order: a sale or a purchase, with the transaction it made. The key makes a retry harmless. */
export const marketOrder = pgTable(
  'market_order',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    idempotencyKey: uuid('idempotency_key').notNull().unique(),
    // SHA-256 of the request behind the key.
    fingerprint: text('fingerprint').notNull(),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    minecraftUuid: uuid('minecraft_uuid').notNull(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => economyAccount.id),
    itemId: text('item_id')
      .notNull()
      .references(() => marketItem.id),
    direction: text('direction').$type<MarketDirection>().notNull(),
    quantity: integer('quantity').notNull(),
    // Cents minted (a sale, after the cap) or burned (a purchase).
    total: bigint('total', { mode: 'number' }).notNull(),
    capped: boolean('capped').default(false).notNull(),
    transactionId: bigint('transaction_id', { mode: 'number' })
      .notNull()
      .references(() => economyTransaction.id),
    stockBefore: quantity('stock_before').notNull(),
    stockAfter: quantity('stock_after').notNull(),
    // The answer the server got, so a retry gets the same one.
    result: jsonb('result').$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('market_order_created_idx').on(table.createdAt),
    index('market_order_item_idx').on(table.itemId, table.createdAt),
    index('market_order_user_idx').on(table.userId, table.createdAt),
    index('market_order_direction_idx').on(table.direction, table.createdAt),
  ],
);

/** What a player sold, in nominal value: the sum of the last 24 hours is their window. */
export const marketSale = pgTable(
  'market_sale',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    tier: smallint('tier').notNull(),
    // LNBits, before any reduction.
    nominal: quantity('nominal').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('market_sale_window_idx').on(table.userId, table.tier, table.createdAt),
    index('market_sale_created_idx').on(table.createdAt),
  ],
);

/** An item's price and stock every hour, for the charts. Written by `market:snapshot`. */
export const marketSnapshot = pgTable(
  'market_snapshot',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    itemId: text('item_id')
      .notNull()
      .references(() => marketItem.id),
    price: quantity('price').notNull(),
    stock: quantity('stock').notNull(),
    at: timestamp('at').defaultNow().notNull(),
  },
  (table) => [
    index('market_snapshot_item_idx').on(table.itemId, table.at),
    index('market_snapshot_at_idx').on(table.at),
  ],
);

/** The recipe graph the Minecraft server sent. Replaced as a whole by every upload. */
export const marketRecipe = pgTable(
  'market_recipe',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    type: text('type').notNull(),
    outputId: text('output_id').notNull(),
    outputCount: integer('output_count').notNull(),
    inputs: jsonb('inputs').$type<{ id: string; count: number }[]>().notNull(),
  },
  (table) => [index('market_recipe_output_idx').on(table.outputId)],
);
