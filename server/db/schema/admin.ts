import { bigserial, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth';

/** Site admin and events manager actions. Warden's own actions go to warden_audit. */
export type AdminAuditAction =
  | 'user.roles'
  | 'user.ban'
  | 'user.unban'
  | 'user.signOut'
  | 'user.delete'
  /** A feature flag switched, with `data.key` and `data.enabled`. */
  | 'flag.update'
  /** The nightly cleanup of inactive accounts, with `data.count`. No actor and no target. */
  | 'users.deleteInactive'
  /** Events, by events managers. `data.eventId` and `data.name`. */
  | 'event.create'
  | 'event.update'
  | 'event.cancel'
  | 'event.delete'
  /** Rooms and types of events. `data.id` and `data.name`. */
  | 'eventRoom.create'
  | 'eventRoom.update'
  | 'eventType.create'
  | 'eventType.update';

// Rows outlive the accounts they name: a deleted actor or target becomes null, so the log keeps
// what happened without keeping who it happened to.
export const adminAudit = pgTable(
  'admin_audit',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    at: timestamp('at').defaultNow().notNull(),
    action: text('action').$type<AdminAuditAction>().notNull(),
    actorUserId: text('actor_user_id').references(() => user.id, { onDelete: 'set null' }),
    targetUserId: text('target_user_id').references(() => user.id, { onDelete: 'set null' }),
    data: jsonb('data').$type<Record<string, unknown>>().default({}).notNull(),
  },
  (table) => [index('admin_audit_target_user_id_idx').on(table.targetUserId, table.id)],
);
