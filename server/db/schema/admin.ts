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
  /** A manager sent the new-event notification. `data.eventId`, `data.name`, `data.recipients`. */
  | 'event.announce'
  /** A manager sent it again, to everyone. Same `data` as `event.announce`. */
  | 'event.announceResend'
  /** A manager registered someone by hand, or removed them. The target is that account. */
  | 'event.registrationAdd'
  | 'event.registrationRemove'
  /** Rooms and types of events. `data.id` and `data.name`. */
  | 'eventRoom.create'
  | 'eventRoom.update'
  | 'eventType.create'
  | 'eventType.update'
  /** The push settings, with `data.weeklyCap` and `data.silenceDays`. */
  | 'push.settings'
  /** Poles of the team page. `data.id` and `data.name`. */
  | 'teamPole.create'
  | 'teamPole.update'
  | 'teamPole.delete'
  /** Members of the team page. The target is that account. `data.poleId`. */
  | 'teamMember.add'
  | 'teamMember.update'
  | 'teamMember.remove'
  /** The team page settings, with `data.joinUrl`. */
  | 'team.settings';

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
