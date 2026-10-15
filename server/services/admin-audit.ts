import type { Tx } from '~~/server/db';
import { adminAudit } from '~~/server/db/schema';
import type { AdminAuditAction } from '~~/server/db/schema';

export interface AdminAuditEntry {
  action: AdminAuditAction;
  actorUserId: string;
  targetUserId: string;
  data?: Record<string, unknown>;
}

/** Writes an audit row in the caller's transaction. */
async function record(tx: Tx, entry: AdminAuditEntry): Promise<void> {
  await tx.insert(adminAudit).values({
    action: entry.action,
    actorUserId: entry.actorUserId,
    targetUserId: entry.targetUserId,
    data: entry.data ?? {},
  });
}

export const adminAuditService = { record };
