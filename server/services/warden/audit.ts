import { wardenAudit } from '~~/server/db/schema';
import type { WardenAuditAction } from '~~/server/db/schema';

import type { Tx, WardenActor } from './shared';

export interface AuditEntry {
  action: WardenAuditAction;
  actor: WardenActor;
  targetUserId?: string | null;
  targetMinecraftUuid?: string | null;
  data?: Record<string, unknown>;
}

/** Writes an audit row in the caller's transaction and returns its ID. */
async function record(tx: Tx, entry: AuditEntry): Promise<number> {
  const { actor } = entry;
  const [row] = await tx
    .insert(wardenAudit)
    .values({
      action: entry.action,
      source: actor.source,
      actorUserId: actor.source === 'system' ? null : actor.userId,
      actorMinecraftUuid: actor.source === 'minecraft' ? (actor.minecraft?.uuid ?? null) : null,
      actorMinecraftName: actor.source === 'minecraft' ? (actor.minecraft?.username ?? null) : null,
      targetUserId: entry.targetUserId ?? null,
      targetMinecraftUuid: entry.targetMinecraftUuid ?? null,
      data: entry.data ?? {},
    })
    .returning({ id: wardenAudit.id });
  return row!.id;
}

export const wardenAuditService = { record };
