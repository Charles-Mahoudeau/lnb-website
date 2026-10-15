import { bigserial, index, jsonb, pgTable, text, timestamp } from 'drizzle-orm/pg-core';

import { user } from './auth';

/** Site admin actions on accounts. Warden's own actions go to warden_audit. */
export type AdminAuditAction =
  | 'user.roles'
  | 'user.ban'
  | 'user.unban'
  | 'user.signOut'
  | 'user.delete'
  /** The nightly cleanup of inactive accounts, with `data.count`. No actor and no target. */
  | 'users.deleteInactive';

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
