import { sql } from 'drizzle-orm';
import {
  bigint,
  bigserial,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

import { user } from './auth';
import { wardenSession } from './warden';
import type {
  AnticheatAction,
  AnticheatAlertKind,
  AnticheatBreakdown,
  AnticheatDecision,
  AnticheatFacts,
  AnticheatFileBand,
  AnticheatFileKind,
  AnticheatLookupState,
  AnticheatMode,
  AnticheatPlayerEventKind,
  AnticheatProjectKind,
  AnticheatRules,
  AnticheatVerdict,
} from '../../../shared/schemas/anticheat';

// The anticheat: file reports from the Minecraft server, their scores and the player trust score.
// See docs/anticheat.md. SHA-512 values are 128 lowercase hex characters.

/** Values a file declares about itself, as first seen. */
export interface AnticheatDeclared {
  modId?: string;
  name?: string;
  version?: string;
  loader?: string;
}

/** What Modrinth and CurseForge said about the exact file. */
export interface AnticheatPlatformVersion {
  modrinth?: { versionId: string; versionNumber: string; loaders: string[]; publishedAt: string };
  curseforge?: { fileId: number; publishedAt: string };
}

/** Project metadata from Modrinth, stored with the time it was fetched. */
export interface AnticheatModrinthProject {
  id: string;
  slug: string;
  title: string;
  projectType: string;
  status: string;
  downloads: number;
  publishedAt: string;
  serverSide: string;
  fetchedAt: string;
}

/** Project metadata from CurseForge, stored with the time it was fetched. */
export interface AnticheatCurseforgeProject {
  id: number;
  slug: string;
  name: string;
  downloadCount: number;
  dateCreated: string;
  fetchedAt: string;
}

export type AnticheatHistoryKind =
  'score' | 'approve' | 'ban' | 'clear' | 'reviewed' | 'note' | 'link' | 'unlink';

/** Global settings, in a single row (id 1). */
export const anticheatSettings = pgTable(
  'anticheat_settings',
  {
    id: smallint('id').primaryKey().default(1),
    // Off stores nothing. Observe scores and logs but always allows. Enforce applies the policy.
    mode: text('mode').$type<AnticheatMode>().default('observe').notNull(),
    rulesVersion: integer('rules_version')
      .notNull()
      .references(() => anticheatRulesVersion.version),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
    updatedByUserId: text('updated_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    check('anticheat_settings_single_row', sql`${table.id} = 1`),
    check('anticheat_settings_mode_check', sql`${table.mode} IN ('off', 'observe', 'enforce')`),
  ],
);

/** One row per saved version of the rules. Never updated. */
export const anticheatRulesVersion = pgTable('anticheat_rules', {
  version: serial('version').primaryKey(),
  rules: jsonb('rules').$type<AnticheatRules>().notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
});

/**
 * A group of files: one Modrinth project, one CurseForge project, or both. A file found on neither
 * platform is grouped by its declared mod ID instead.
 */
export const anticheatProject = pgTable(
  'anticheat_project',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    kind: text('kind').$type<AnticheatProjectKind>().notNull(),
    name: text('name').notNull(),
    modrinthId: text('modrinth_id').unique(),
    curseforgeId: text('curseforge_id').unique(),
    // Declared mod IDs seen on files a platform confirmed.
    modIds: text('mod_ids')
      .array()
      .default(sql`'{}'::text[]`)
      .notNull(),
    // Set only on projects with no platform ID.
    declaredModId: text('declared_mod_id').unique(),
    modrinth: jsonb('modrinth').$type<AnticheatModrinthProject>(),
    curseforge: jsonb('curseforge').$type<AnticheatCurseforgeProject>(),
    decision: text('decision').$type<AnticheatDecision>(),
    decidedAt: timestamp('decided_at'),
    decidedByUserId: text('decided_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    decisionNote: text('decision_note'),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    updatedAt: timestamp('updated_at')
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
  },
  (table) => [
    check('anticheat_project_kind_check', sql`${table.kind} IN ('mod', 'resourcepack', 'shader')`),
    check(
      'anticheat_project_decision_check',
      sql`${table.decision} IS NULL OR ${table.decision} IN ('approved', 'banned')`,
    ),
    check(
      'anticheat_project_identity_check',
      sql`${table.modrinthId} IS NOT NULL OR ${table.curseforgeId} IS NOT NULL OR ${table.declaredModId} IS NOT NULL`,
    ),
  ],
);

/** One file, by hash. */
export const anticheatFile = pgTable(
  'anticheat_file',
  {
    sha512: text('sha512').primaryKey(),
    kind: text('kind').$type<AnticheatFileKind>().notNull(),
    // The CurseForge fingerprint the client sent.
    fingerprint: bigint('fingerprint', { mode: 'number' }),
    filename: text('filename').notNull(),
    // The first values seen.
    declared: jsonb('declared').$type<AnticheatDeclared>().default({}).notNull(),
    projectId: uuid('project_id').references(() => anticheatProject.id, { onDelete: 'set null' }),
    platformVersion: jsonb('platform_version').$type<AnticheatPlatformVersion>(),
    lookupState: text('lookup_state').$type<AnticheatLookupState>().default('pending').notNull(),
    lookupStartedAt: timestamp('lookup_started_at'),
    lookedUpAt: timestamp('looked_up_at'),
    lookupRetryAt: timestamp('lookup_retry_at'),
    // Resource pack facts. Disputed when two reports disagreed.
    facts: jsonb('facts').$type<AnticheatFacts>(),
    factsDisputed: boolean('facts_disputed').default(false).notNull(),
    decision: text('decision').$type<AnticheatDecision>(),
    decidedAt: timestamp('decided_at'),
    decidedByUserId: text('decided_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    decisionNote: text('decision_note'),
    // "Reviewed, keep the score": valid while the file stays in the same band.
    reviewedAt: timestamp('reviewed_at'),
    reviewedByUserId: text('reviewed_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
    reviewedBand: text('reviewed_band').$type<AnticheatFileBand>(),
    score: smallint('score'),
    band: text('band').$type<AnticheatFileBand>(),
    breakdown: jsonb('breakdown').$type<AnticheatBreakdown>(),
    rulesVersion: integer('rules_version'),
    scoredAt: timestamp('scored_at'),
    rescoreAt: timestamp('rescore_at'),
    firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
  },
  (table) => [
    index('anticheat_file_project_id_idx').on(table.projectId),
    index('anticheat_file_lookup_idx').on(table.lookupState, table.lookupStartedAt),
    index('anticheat_file_kind_score_idx').on(table.kind, table.score),
    index('anticheat_file_rescore_at_idx').on(table.rescoreAt),
    check(
      'anticheat_file_kind_check',
      sql`${table.kind} IN ('mod', 'resourcepack', 'shader', 'client')`,
    ),
    check(
      'anticheat_file_lookup_state_check',
      sql`${table.lookupState} IN ('pending', 'found', 'notFound', 'timedOut', 'skipped')`,
    ),
    check(
      'anticheat_file_decision_check',
      sql`${table.decision} IS NULL OR ${table.decision} IN ('approved', 'banned')`,
    ),
  ],
);

/** A banned declared mod ID: every file that declares it scores 0. Lowercase. */
export const anticheatModIdBan = pgTable('anticheat_mod_id_ban', {
  modId: text('mod_id').primaryKey(),
  reason: text('reason').notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
  createdByUserId: text('created_by_user_id').references(() => user.id, { onDelete: 'set null' }),
});

/** Scores and admin actions on a file or a project, for the detail view. */
export const anticheatHistory = pgTable(
  'anticheat_history',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    sha512: text('sha512').references(() => anticheatFile.sha512, { onDelete: 'cascade' }),
    projectId: uuid('project_id').references(() => anticheatProject.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<AnticheatHistoryKind>().notNull(),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    data: jsonb('data').$type<Record<string, unknown>>().default({}).notNull(),
    at: timestamp('at').defaultNow().notNull(),
  },
  (table) => [
    index('anticheat_history_sha512_id_idx').on(table.sha512, table.id),
    index('anticheat_history_project_id_id_idx').on(table.projectId, table.id),
    check(
      'anticheat_history_kind_check',
      sql`${table.kind} IN ('score', 'approve', 'ban', 'clear', 'reviewed', 'note', 'link', 'unlink')`,
    ),
  ],
);

/** One report of a client's files, sent by the Minecraft server for a session. */
export const anticheatReport = pgTable(
  'anticheat_report',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    sessionId: uuid('session_id')
      .notNull()
      .references(() => wardenSession.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    minecraftUuid: uuid('minecraft_uuid').notNull(),
    // 1 for the join report, then 2, 3... in the session.
    seq: integer('seq').notNull(),
    mode: text('mode').$type<AnticheatMode>().notNull(),
    rulesVersion: integer('rules_version').notNull(),
    verdict: jsonb('verdict').$type<AnticheatVerdict>().notNull(),
    playerScore: smallint('player_score').notNull(),
    modlistChecked: boolean('modlist_checked').default(false).notNull(),
    // Names of the official mods the client lacked.
    modlistMissing: jsonb('modlist_missing').$type<string[]>(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    evaluatedAt: timestamp('evaluated_at').defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('anticheat_report_session_id_seq_uidx').on(table.sessionId, table.seq),
    index('anticheat_report_user_id_created_at_idx').on(table.userId, table.createdAt),
  ],
);

/** A file in a report, with the snapshot the verdict used. */
export const anticheatReportFile = pgTable(
  'anticheat_report_file',
  {
    reportId: uuid('report_id')
      .notNull()
      .references(() => anticheatReport.id, { onDelete: 'cascade' }),
    sha512: text('sha512')
      .notNull()
      .references(() => anticheatFile.sha512, { onDelete: 'cascade' }),
    kind: text('kind').$type<AnticheatFileKind>().notNull(),
    filename: text('filename').notNull(),
    // As reported this time.
    declared: jsonb('declared').$type<AnticheatDeclared>().default({}).notNull(),
    score: smallint('score'),
    effectiveScore: smallint('effective_score'),
    band: text('band').$type<AnticheatFileBand>(),
    // Null while the file is pending.
    action: text('action').$type<AnticheatAction>(),
  },
  (table) => [
    primaryKey({ columns: [table.reportId, table.sha512] }),
    index('anticheat_report_file_sha512_idx').on(table.sha512),
  ],
);

/** A player and a file they have used. */
export const anticheatUsage = pgTable(
  'anticheat_usage',
  {
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sha512: text('sha512')
      .notNull()
      .references(() => anticheatFile.sha512, { onDelete: 'cascade' }),
    firstSeenAt: timestamp('first_seen_at').defaultNow().notNull(),
    lastSeenAt: timestamp('last_seen_at').defaultNow().notNull(),
    sessionCount: integer('session_count').default(1).notNull(),
    lastSessionId: uuid('last_session_id'),
    lastVersion: text('last_version'),
    lastMinecraftUuid: uuid('last_minecraft_uuid').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.userId, table.sha512] }),
    index('anticheat_usage_sha512_idx').on(table.sha512),
  ],
);

/** The trust score of an LNB account (not of a Minecraft account), and a manual hold. */
export const anticheatPlayer = pgTable('anticheat_player', {
  userId: text('user_id')
    .primaryKey()
    .references(() => user.id, { onDelete: 'cascade' }),
  score: smallint('score').default(50).notNull(),
  // "Hold the next join": the only hold that is stored. The others derive from scores.
  manualHold: boolean('manual_hold').default(false).notNull(),
  holdReason: text('hold_reason'),
  holdAt: timestamp('hold_at'),
  holdByUserId: text('hold_by_user_id').references(() => user.id, { onDelete: 'set null' }),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

/** The timeline of a player's trust score. */
export const anticheatPlayerEvent = pgTable(
  'anticheat_player_event',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => wardenSession.id, { onDelete: 'set null' }),
    // The server's idempotency key.
    eventId: uuid('event_id').unique(),
    kind: text('kind').$type<AnticheatPlayerEventKind>().notNull(),
    delta: smallint('delta').notNull(),
    // False in observe mode: recorded, but the score did not move.
    applied: boolean('applied').notNull(),
    scoreAfter: smallint('score_after').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().default({}).notNull(),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    at: timestamp('at').defaultNow().notNull(),
  },
  (table) => [
    index('anticheat_player_event_user_id_id_idx').on(table.userId, table.id),
    check(
      'anticheat_player_event_kind_check',
      sql`${table.kind} IN ('challengeWrong', 'challengeMissed', 'modSetChanged', 'channelMismatch', 'modlistIncomplete', 'playtime', 'adminAdjust', 'bulkPenalty', 'holdSet', 'holdCleared')`,
    ),
  ],
);

/** What the Minecraft server did with a verdict, as it reported. */
export const anticheatActionTaken = pgTable(
  'anticheat_action',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    sessionId: uuid('session_id').references(() => wardenSession.id, { onDelete: 'set null' }),
    reportId: uuid('report_id').references(() => anticheatReport.id, { onDelete: 'set null' }),
    action: text('action').$type<AnticheatAction>().notNull(),
    // A rule code, such as fileRefused.
    reason: text('reason').notNull(),
    sha512: text('sha512'),
    at: timestamp('at').defaultNow().notNull(),
  },
  (table) => [index('anticheat_action_user_id_id_idx').on(table.userId, table.id)],
);

/** Something an admin should look at. Shown in the admin only, never sent out. */
export const anticheatAlert = pgTable(
  'anticheat_alert',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    kind: text('kind').$type<AnticheatAlertKind>().notNull(),
    userId: text('user_id').references(() => user.id, { onDelete: 'cascade' }),
    sha512: text('sha512').references(() => anticheatFile.sha512, { onDelete: 'cascade' }),
    data: jsonb('data').$type<Record<string, unknown>>().default({}).notNull(),
    createdAt: timestamp('created_at').defaultNow().notNull(),
    dismissedAt: timestamp('dismissed_at'),
    dismissedByUserId: text('dismissed_by_user_id').references(() => user.id, {
      onDelete: 'set null',
    }),
  },
  (table) => [
    // An open alert of the same kind, player and file is not created twice.
    uniqueIndex('anticheat_alert_open_uidx')
      .on(table.kind, sql`coalesce(${table.userId}, '')`, sql`coalesce(${table.sha512}, '')`)
      .where(sql`${table.dismissedAt} IS NULL`),
    index('anticheat_alert_created_at_idx').on(table.createdAt),
    check(
      'anticheat_alert_kind_check',
      sql`${table.kind} IN ('fileRefused', 'bannedFileSeen', 'playerHeld', 'factsDisputed', 'banAffectsPlayers')`,
    ),
  ],
);
