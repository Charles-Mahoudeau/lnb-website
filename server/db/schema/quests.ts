import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { economyTransaction } from './economy';

// Quests on the Minecraft server: tiers each player climbs, advancements paid by rank, community
// goals, flash races and daily quests. Rewards are LNBits minted with the reason `questReward`, sized by a daily
// index of the players' wealth. See docs/quests.md.

export type QuestFamily = 'individual' | 'server' | 'flash' | 'daily';
export type QuestCategoryFamily = 'individual' | 'server';
export type QuestSource = 'catalog' | 'site';
export type QuestCommunityStatus = 'scheduled' | 'running' | 'paid' | 'cancelled';

/**
 * A quest of the catalogue. The definition (names, objective, tiers or ranks, rewards) is kept as
 * JSON and checked by `questDefinition` in shared/schemas/quests.ts. Community quests have their
 * own table. A quest someone completed is never deleted, only disabled.
 */
export const quest = pgTable('quest', {
  id: text('id').primaryKey(),
  family: text('family').$type<QuestFamily>().notNull(),
  definition: jsonb('definition').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  sortOrder: integer('sort_order').default(0).notNull(),
  // `catalog` when the server's quests.json brought it, `site` when an admin made it.
  source: text('source').$type<QuestSource>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/**
 * A category: an individual chapter or a Records group, with its subcategories (headings inside it).
 * Quests name it in their definition. Brought by quests.json or made by an admin; one a quest uses
 * can't be deleted.
 */
export const questCategory = pgTable(
  'quest_category',
  {
    family: text('family').$type<QuestCategoryFamily>().notNull(),
    id: text('id').notNull(),
    name: jsonb('name').$type<{ fr: string; en: string }>().notNull(),
    icon: text('icon').notNull(),
    siteIcon: text('site_icon'),
    subcategories: jsonb('subcategories')
      .$type<{ id: string; name: { fr: string; en: string } }[]>()
      .default([])
      .notNull(),
    sortOrder: integer('sort_order').default(0).notNull(),
    source: text('source').$type<QuestSource>().notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.family, table.id] })],
);

/**
 * A reward earned: an individual tier reached, or a rank on a server quest. The amount is frozen
 * when it is recorded. Individual tiers wait for a claim; server ranks are paid at once.
 */
export const questCompletion = pgTable(
  'quest_completion',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questId: text('quest_id')
      .notNull()
      .references(() => quest.id),
    family: text('family').$type<QuestFamily>().notNull(),
    // The individual tier, from 1. Always 1 on a server quest.
    tier: smallint('tier').notNull(),
    // The rank on a server quest, from 1. Null on an individual one.
    rank: integer('rank'),
    // Null once the LNB account is deleted: podiums keep the row.
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    minecraftUuid: uuid('minecraft_uuid').notNull(),
    // The Minecraft username at the time, for podiums.
    username: text('username').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    capped: boolean('capped').default(false).notNull(),
    kGlobal: real('k_global').notNull(),
    kPlayer: real('k_player').notNull(),
    completedAt: timestamp('completed_at').defaultNow().notNull(),
    idempotencyKey: uuid('idempotency_key').notNull().unique(),
    fingerprint: text('fingerprint').notNull(),
    claimedAt: timestamp('claimed_at'),
    claimKey: uuid('claim_key').unique(),
    claimFingerprint: text('claim_fingerprint'),
    transactionId: bigint('transaction_id', { mode: 'number' }).references(
      () => economyTransaction.id,
    ),
  },
  (table) => [
    uniqueIndex('quest_completion_user_idx').on(table.questId, table.tier, table.userId),
    uniqueIndex('quest_completion_rank_idx').on(table.questId, table.rank),
    index('quest_completion_completed_idx').on(table.completedAt),
  ],
);

/** A player's counter on an individual quest, as the server last sent it. */
export const questProgress = pgTable(
  'quest_progress',
  {
    questId: text('quest_id')
      .notNull()
      .references(() => quest.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    value: bigint('value', { mode: 'number' }).notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  (table) => [primaryKey({ columns: [table.questId, table.userId] })],
);

/** One flash race, won or expired. */
export const questFlashRun = pgTable(
  'quest_flash_run',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    questId: text('quest_id')
      .notNull()
      .references(() => quest.id),
    quantity: integer('quantity').notNull(),
    startedAt: timestamp('started_at').notNull(),
    endedAt: timestamp('ended_at').notNull(),
    winnerUserId: text('winner_user_id').references(() => user.id, { onDelete: 'set null' }),
    winnerMinecraftUuid: uuid('winner_minecraft_uuid'),
    winnerUsername: text('winner_username'),
    amount: bigint('amount', { mode: 'number' }).default(0).notNull(),
    capped: boolean('capped').default(false).notNull(),
    transactionId: bigint('transaction_id', { mode: 'number' }).references(
      () => economyTransaction.id,
    ),
    idempotencyKey: uuid('idempotency_key').notNull().unique(),
    fingerprint: text('fingerprint').notNull(),
  },
  (table) => [index('quest_flash_run_ended_idx').on(table.endedAt)],
);

/** A daily quest drawn for one Paris day, the same for everyone. Drawn when first asked for. */
export const questDailyDraw = pgTable(
  'quest_daily_draw',
  {
    day: date('day', { mode: 'string' }).notNull(),
    slot: smallint('slot').notNull(),
    questId: text('quest_id')
      .notNull()
      .references(() => quest.id),
    quantity: integer('quantity').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.day, table.slot] }),
    uniqueIndex('quest_daily_draw_quest_idx').on(table.day, table.questId),
  ],
);

/** A daily quest one person finished, paid at once. Once per day, quest and LNB account. */
export const questDailyCompletion = pgTable(
  'quest_daily_completion',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    day: date('day', { mode: 'string' }).notNull(),
    questId: text('quest_id')
      .notNull()
      .references(() => quest.id),
    userId: text('user_id').references(() => user.id, { onDelete: 'set null' }),
    minecraftUuid: uuid('minecraft_uuid').notNull(),
    username: text('username').notNull(),
    quantity: integer('quantity').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    capped: boolean('capped').default(false).notNull(),
    kGlobal: real('k_global').notNull(),
    kPlayer: real('k_player').notNull(),
    transactionId: bigint('transaction_id', { mode: 'number' }).references(
      () => economyTransaction.id,
    ),
    idempotencyKey: uuid('idempotency_key').notNull().unique(),
    fingerprint: text('fingerprint').notNull(),
    completedAt: timestamp('completed_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('quest_daily_completion_user_idx').on(table.day, table.questId, table.userId),
    index('quest_daily_completion_completed_idx').on(table.completedAt),
  ],
);

/** A community quest: the whole server works towards one goal, paid by tier when it ends. */
export const questCommunity = pgTable(
  'quest_community',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    // Title, objective, goal, tiers, threshold and bonus, checked by `questCommunityDefinition`.
    definition: jsonb('definition').notNull(),
    startsAt: timestamp('starts_at').notNull(),
    endsAt: timestamp('ends_at').notNull(),
    status: text('status').$type<QuestCommunityStatus>().default('scheduled').notNull(),
    progress: bigint('progress', { mode: 'number' }).default(0).notNull(),
    // Set by the rotation when it drew this quest from a template.
    templateId: uuid('template_id'),
    paidAt: timestamp('paid_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    index('quest_community_status_idx').on(table.status, table.startsAt),
    // One running community quest at a time.
    uniqueIndex('quest_community_running_idx')
      .on(table.status)
      .where(sql`${table.status} = 'running'`),
  ],
);

/** What one player brought to a community quest. */
export const questCommunityContribution = pgTable(
  'quest_community_contribution',
  {
    communityId: uuid('community_id')
      .notNull()
      .references(() => questCommunity.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    username: text('username').notNull(),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    // Filled when the quest is paid.
    payout: bigint('payout', { mode: 'number' }),
    transactionId: bigint('transaction_id', { mode: 'number' }).references(
      () => economyTransaction.id,
    ),
  },
  (table) => [primaryKey({ columns: [table.communityId, table.userId] })],
);

/** A batch of contributions the server sent, so a retry doesn't count twice. */
export const questCommunityBatch = pgTable('quest_community_batch', {
  idempotencyKey: uuid('idempotency_key').primaryKey(),
  communityId: uuid('community_id')
    .notNull()
    .references(() => questCommunity.id, { onDelete: 'cascade' }),
  fingerprint: text('fingerprint').notNull(),
  at: timestamp('at').defaultNow().notNull(),
});

/** A community quest the weekly rotation can draw. */
export const questCommunityTemplate = pgTable('quest_community_template', {
  id: uuid('id').primaryKey().defaultRandom(),
  definition: jsonb('definition').notNull(),
  enabled: boolean('enabled').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/** The reward index of one day (Europe/Paris), written by the nightly quests:index task. */
export const questIndexDay = pgTable('quest_index_day', {
  day: date('day', { mode: 'string' }).primaryKey(),
  activePlayers: integer('active_players').notNull(),
  median: real('median').notNull(),
  q3: real('q3').notNull(),
  mean: real('mean').notNull(),
  index: real('index').notNull(),
  kGlobal: real('k_global').notNull(),
  // True when there were too few active players and the reference index was used.
  fallback: boolean('fallback').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/** Quest settings, in a single row (id 1), checked by `questSettings` in shared/schemas/quests.ts. */
export const questSettingsRow = pgTable(
  'quest_settings',
  {
    id: smallint('id').primaryKey().default(1),
    values: jsonb('values').notNull(),
    // When an admin last reset the quests: the server starts every player over when it changes.
    resetAt: timestamp('reset_at'),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    updatedByUserId: text('updated_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [check('quest_settings_single_row', sql`${table.id} = 1`)],
);
