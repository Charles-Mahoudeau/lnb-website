import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { deviceCode, user } from './auth';

// Warden: Minecraft accounts linked to LNB accounts. See docs/warden.md.

/** Where an action came from: the site, the Minecraft server, or the site on its own. */
export type WardenSource = 'web' | 'minecraft' | 'system';

/** One row per LNB account that uses Warden, created on first need. */
export const wardenPlayer = pgTable('warden_player', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  // The label in <token>.mc.bde-teknantes.fr. Kept as is so /warden can always show it.
  serverToken: text('server_token').notNull().unique(),
  tokenRotatedAt: timestamp('token_rotated_at').defaultNow().notNull(),
  showRealName: boolean('show_real_name').default(false).notNull(),
  // Overrides warden_settings.default_max_accounts when set.
  maxAccounts: smallint('max_accounts'),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

/** The primary key makes a Minecraft account belong to one LNB account at most. */
export const minecraftAccount = pgTable(
  'minecraft_account',
  {
    uuid: uuid('uuid').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    username: text('username').notNull(),
    cracked: boolean('cracked').notNull(),
    linkedAt: timestamp('linked_at').defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at'),
    playtimeSeconds: bigint('playtime_seconds', { mode: 'number' }).default(0).notNull(),
  },
  (table) => [index('minecraft_account_user_id_idx').on(table.userId)],
);

/** Every username a linked account has used, for its history. */
export const minecraftUsername = pgTable(
  'minecraft_username',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    minecraftUuid: uuid('minecraft_uuid')
      .notNull()
      .references(() => minecraftAccount.uuid, { onDelete: 'cascade' }),
    username: text('username').notNull(),
    firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('minecraft_username_uuid_username_uidx').on(table.minecraftUuid, table.username),
  ],
);

/**
 * The Minecraft account behind a Warden link code. The code itself is a Better Auth device code
 * (client "warden"), so /link claims and expires it like any other. Its status is the code's.
 */
export const wardenLinkRequest = pgTable(
  'warden_link_request',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    deviceCodeId: text('device_code_id')
      .notNull()
      .unique()
      .references(() => deviceCode.id, { onDelete: 'cascade' }),
    minecraftUuid: uuid('minecraft_uuid').notNull(),
    username: text('username').notNull(),
    cracked: boolean('cracked').notNull(),
    // Set when the server knew the player from their address: only they can link it.
    boundUserId: text('bound_user_id').references(() => user.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('warden_link_request_minecraft_uuid_idx').on(table.minecraftUuid)],
);

export type WardenSessionEndReason = 'quit' | 'kicked' | 'timeout';

/** One stay on the Minecraft server, from login to quit (or the last heartbeat). */
export const wardenSession = pgTable(
  'warden_session',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    minecraftUuid: uuid('minecraft_uuid')
      .notNull()
      .references(() => minecraftAccount.uuid, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    startedAt: timestamp('started_at').defaultNow().notNull(),
    lastHeartbeatAt: timestamp('last_heartbeat_at').defaultNow().notNull(),
    endedAt: timestamp('ended_at'),
    endReason: text('end_reason').$type<WardenSessionEndReason>(),
  },
  (table) => [
    index('warden_session_user_id_started_at_idx').on(table.userId, table.startedAt),
    index('warden_session_open_idx')
      .on(table.lastHeartbeatAt)
      .where(sql`${table.endedAt} is null`),
  ],
);

/** A ban on an LNB account, so on all of its Minecraft accounts. Revoked bans stay as history. */
export const wardenBan = pgTable(
  'warden_ban',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    // The account the player was on, for bans from the Minecraft server.
    minecraftUuid: uuid('minecraft_uuid'),
    reason: text('reason').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    // Null for a permanent ban.
    expiresAt: timestamp('expires_at'),
    source: text('source').$type<WardenSource>().notNull(),
    issuedByUserId: text('issued_by_user_id').references(() => user.id, { onDelete: 'set null' }),
    issuedByMinecraftUuid: uuid('issued_by_minecraft_uuid'),
    issuedByMinecraftName: text('issued_by_minecraft_name'),
    revokedAt: timestamp('revoked_at'),
    revokedByUserId: text('revoked_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    revokedByMinecraftUuid: uuid('revoked_by_minecraft_uuid'),
    revokedByMinecraftName: text('revoked_by_minecraft_name'),
    revokeSource: text('revoke_source').$type<WardenSource>(),
    revokeReason: text('revoke_reason'),
  },
  (table) => [index('warden_ban_user_id_created_at_idx').on(table.userId, table.createdAt)],
);

export type WardenAppealStatus = 'pending' | 'accepted' | 'rejected';

/** One appeal per ban, sent by the player from /warden. */
export const wardenAppeal = pgTable(
  'warden_appeal',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    banId: uuid('ban_id')
      .notNull()
      .unique()
      .references(() => wardenBan.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    status: text('status').$type<WardenAppealStatus>().default('pending').notNull(),
    decidedByUserId: text('decided_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    decidedAt: timestamp('decided_at'),
    response: text('response'),
  },
  (table) => [index('warden_appeal_status_idx').on(table.status, table.createdAt)],
);

export type WardenNoteKind = 'note' | 'warning';

/** Notes stay with admins. Warnings are shown to the player. */
export const wardenNote = pgTable(
  'warden_note',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<WardenNoteKind>().notNull(),
    body: text('body').notNull(),
    source: text('source').$type<WardenSource>().notNull(),
    authorUserId: text('author_user_id').references(() => user.id, { onDelete: 'set null' }),
    authorMinecraftUuid: uuid('author_minecraft_uuid'),
    authorMinecraftName: text('author_minecraft_name'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  (table) => [index('warden_note_user_id_created_at_idx').on(table.userId, table.createdAt)],
);

export const WARDEN_AUDIT_ACTIONS = [
  'link',
  'unlink',
  'token.rotate',
  'ban',
  'unban',
  'ban.expire',
  'appeal.create',
  'appeal.decide',
  'note.create',
  'warning.create',
  'limit.set',
  'role.set',
  'settings.update',
  'identity.update',
] as const;

export type WardenAuditAction = (typeof WARDEN_AUDIT_ACTIONS)[number];

/**
 * Every Warden change: who, when, from where, and to whom. Its IDs also number the events sent
 * to the Minecraft server, which replays missed ones from here.
 */
export const wardenAudit = pgTable(
  'warden_audit',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at').defaultNow().notNull(),
    action: text('action').$type<WardenAuditAction>().notNull(),
    source: text('source').$type<WardenSource>().notNull(),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    actorMinecraftUuid: uuid('actor_minecraft_uuid'),
    actorMinecraftName: text('actor_minecraft_name'),
    targetUserId: text('target_user_id').references(() => user.id, { onDelete: 'cascade' }),
    targetMinecraftUuid: uuid('target_minecraft_uuid'),
    data: jsonb('data').$type<Record<string, unknown>>().default({}).notNull(),
  },
  (table) => [
    index('warden_audit_target_user_id_idx').on(table.targetUserId, table.id),
    index('warden_audit_action_idx').on(table.action, table.id),
  ],
);

/** Global settings, in a single row (id 1). */
export const wardenSettings = pgTable(
  'warden_settings',
  {
    id: smallint('id').primaryKey().default(1),
    defaultMaxAccounts: smallint('default_max_accounts').default(1).notNull(),
    allowCracked: boolean('allow_cracked').default(true).notNull(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    updatedByUserId: text('updated_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [check('warden_settings_single_row', sql`${table.id} = 1`)],
);
