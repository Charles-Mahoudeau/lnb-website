import { sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import {
  bigint,
  bigserial,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';

// The Minecraft economy: LNBits on bank accounts, moved only through a double-entry ledger.
// See docs/economy.md.

export type EconomyAccountKind = 'personal' | 'shared';
export type EconomyMemberRole = 'owner' | 'member' | 'viewer';
/** What a transaction was. `mint` and `burn` create and destroy money; nothing else does. */
export type EconomyTransactionKind = 'payment' | 'casino' | 'mint' | 'burn' | 'reversal';
/** Why money was created or destroyed. Null for the other kinds. */
export type EconomyReason = 'startingBalance' | 'adjustment' | 'accountClosed';
/** Where a transaction came from: the Minecraft server, the site, or the site on its own. */
export type EconomySource = 'minecraft' | 'web' | 'system';

/**
 * A bank account. Every LNB account that can play gets one personal account, created on first
 * need. Shared accounts belong to their members (economy_member) and have a unique `#handle`.
 * Accounts are never deleted, so the ledger stays whole: they are closed. A personal account
 * whose owner was deleted keeps its row, with the owner set to null.
 */
export const economyAccount = pgTable(
  'economy_account',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').$type<EconomyAccountKind>().notNull(),
    // Personal accounts only.
    ownerUserId: text('owner_user_id').references(() => user.id, { onDelete: 'set null' }),
    // Shared accounts only: lower case, shown with a leading `#`. Kept after closing, so a closed
    // casino's handle can't be taken over by someone else.
    handle: text('handle'),
    name: text('name'),
    balance: bigint('balance', { mode: 'number' }).default(0).notNull(),
    frozenAt: timestamp('frozen_at'),
    frozenReason: text('frozen_reason'),
    frozenByUserId: text('frozen_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    closedAt: timestamp('closed_at'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('economy_account_owner_uidx').on(table.ownerUserId),
    uniqueIndex('economy_account_handle_uidx').on(table.handle),
    index('economy_account_balance_idx').on(table.balance),
    check('economy_account_balance_non_negative', sql`${table.balance} >= 0`),
    check(
      'economy_account_kind_fields',
      sql`(${table.kind} = 'personal' and ${table.handle} is null) or (${table.kind} = 'shared' and ${table.handle} is not null and ${table.ownerUserId} is null)`,
    ),
  ],
);

/** Who is in a shared account, and with which rights. */
export const economyMember = pgTable(
  'economy_member',
  {
    accountId: uuid('account_id')
      .notNull()
      .references(() => economyAccount.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').$type<EconomyMemberRole>().notNull(),
    joinedAt: timestamp('joined_at').defaultNow().notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.accountId, table.userId] }),
    index('economy_member_user_id_idx').on(table.userId),
  ],
);

/** An invitation to a shared account, waiting for the invited player to accept it on the site. */
export const economyInvitation = pgTable(
  'economy_invitation',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => economyAccount.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    role: text('role').$type<EconomyMemberRole>().notNull(),
    invitedByUserId: text('invited_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('economy_invitation_account_user_uidx').on(table.accountId, table.userId),
    index('economy_invitation_user_id_idx').on(table.userId),
  ],
);

/** A player's economy preferences, created on first change. */
export const economyProfile = pgTable('economy_profile', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  // Pays in the game. Null, or an account the player can no longer spend from: the personal one.
  defaultAccountId: uuid('default_account_id').references(() => economyAccount.id, {
    onDelete: 'set null',
  }),
  hideFromBaltop: boolean('hide_from_baltop').default(false).notNull(),
});

/**
 * One movement of money. Its entries (economy_entry) add up to zero. Never updated or deleted:
 * a mistake is undone by a reversal, a new transaction with the opposite entries.
 */
export const economyTransaction = pgTable(
  'economy_transaction',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at').defaultNow().notNull(),
    kind: text('kind').$type<EconomyTransactionKind>().notNull(),
    reason: text('reason').$type<EconomyReason>(),
    // The player's message on a payment, or the admin's reason on an adjustment or a reversal.
    memo: text('memo'),
    // Sent by the Minecraft server with every money move, so a retry can't pay twice.
    idempotencyKey: uuid('idempotency_key').unique(),
    // SHA-256 of the request behind the key, to refuse the same key on a different request.
    fingerprint: text('fingerprint'),
    source: text('source').$type<EconomySource>().notNull(),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    actorMinecraftUuid: uuid('actor_minecraft_uuid'),
    reversesId: bigint('reverses_id', { mode: 'number' })
      .unique()
      .references((): AnyPgColumn => economyTransaction.id),
  },
  (table) => [
    index('economy_transaction_at_idx').on(table.at),
    index('economy_transaction_kind_idx').on(table.kind, table.id),
  ],
);

/**
 * One line of a transaction. A null account is LNB itself: money created (a negative amount) or
 * destroyed (a positive one). `balanceAfter` is the account's balance right after this line.
 */
export const economyEntry = pgTable(
  'economy_entry',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    transactionId: bigint('transaction_id', { mode: 'number' })
      .notNull()
      .references(() => economyTransaction.id, { onDelete: 'cascade' }),
    accountId: uuid('account_id').references(() => economyAccount.id),
    amount: bigint('amount', { mode: 'number' }).notNull(),
    balanceAfter: bigint('balance_after', { mode: 'number' }),
  },
  (table) => [
    index('economy_entry_account_idx').on(table.accountId, table.transactionId),
    index('economy_entry_transaction_idx').on(table.transactionId),
    check('economy_entry_amount_not_zero', sql`${table.amount} <> 0`),
  ],
);

/** Global settings, in a single row (id 1). */
export const economySettings = pgTable(
  'economy_settings',
  {
    id: smallint('id').primaryKey().default(1),
    // Minted onto every new personal account.
    startingBalance: integer('starting_balance').default(0).notNull(),
    maxOwnedShared: smallint('max_owned_shared').default(3).notNull(),
    maxMembers: smallint('max_members').default(20).notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    updatedByUserId: text('updated_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [check('economy_settings_single_row', sql`${table.id} = 1`)],
);

/** Volume of one transaction kind over a day. */
export interface EconomyKindVolume {
  amount: number;
  count: number;
}

/**
 * One closed day (Europe/Paris) of the ledger, written by the nightly economy:snapshot task so the
 * admin charts don't scan the whole ledger. The current day is computed live.
 */
export const economyDailyStat = pgTable('economy_daily_stat', {
  day: date('day', { mode: 'string' }).primaryKey(),
  minted: bigint('minted', { mode: 'number' }).notNull(),
  burned: bigint('burned', { mode: 'number' }).notNull(),
  // Money in circulation at the end of the day.
  supply: bigint('supply', { mode: 'number' }).notNull(),
  volume: jsonb('volume')
    .$type<Partial<Record<EconomyTransactionKind, EconomyKindVolume>>>()
    .default({})
    .notNull(),
  computedAt: timestamp('computed_at').defaultNow().notNull(),
});
