import { bigserial, index, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { user } from './auth';
import { AUDIT_ACTIONS } from '../../../shared/utils/audit-actions.ts';
import type { AuditAction } from '../../../shared/utils/audit-actions.ts';

export { AUDIT_ACTIONS };
export type { AuditAction };

/** Where an action came from: an admin or a player on the site, the Minecraft server, or a job. */
export type AuditSource = 'site' | 'server' | 'system';

/**
 * Every change made from the admin, by the Minecraft server, by players on what admins watch, and
 * by the nightly jobs. Its IDs also number the events sent to the Minecraft server, which replays
 * the ones it missed. Rows outlive the accounts they name: a deleted account's user IDs become
 * null (by the foreign keys) and its Minecraft UUIDs are emptied by the deletion itself, so the
 * log keeps what happened, not who it happened to.
 */
export const audit = pgTable(
  'audit',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at').defaultNow().notNull(),
    action: text('action').$type<AuditAction>().notNull(),
    source: text('source').$type<AuditSource>().default('site').notNull(),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    actorMinecraftUuid: uuid('actor_minecraft_uuid'),
    actorMinecraftName: text('actor_minecraft_name'),
    targetUserId: text('target_user_id').references(() => user.id, { onDelete: 'set null' }),
    targetMinecraftUuid: uuid('target_minecraft_uuid'),
    data: jsonb('data').$type<Record<string, unknown>>().default({}).notNull(),
  },
  (table) => [
    index('audit_target_user_id_idx').on(table.targetUserId, table.id),
    index('audit_action_idx').on(table.action, table.id),
    index('audit_at_idx').on(table.at),
  ],
);
