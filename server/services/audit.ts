import { inArray, lt } from 'drizzle-orm';

import { db } from '~~/server/db';
import type { Tx } from '~~/server/db';
import { audit } from '~~/server/db/schema';
import type { AuditAction } from '~~/server/db/schema';

/** Who did it: a person on the site, the Minecraft server (with its in-game actor), or a job. */
export type AuditActor =
  /** `userId` is null when an API key acts: the entry's `data.apiKey` says which. */
  | { source: 'web'; userId: string | null }
  | {
      source: 'minecraft';
      userId: string | null;
      minecraft: { uuid: string; username: string } | null;
    }
  | { source: 'system' };

export interface AuditEntry {
  action: AuditAction;
  actor: AuditActor;
  targetUserId?: string | null;
  targetMinecraftUuid?: string | null;
  /** What the action's sentence needs (docs/activity-log.md). */
  data?: Record<string, unknown>;
}

/** Writes an audit row in the caller's transaction and returns its ID. */
async function record(tx: Tx, entry: AuditEntry): Promise<number> {
  const { actor } = entry;
  const [row] = await tx
    .insert(audit)
    .values({
      action: entry.action,
      source: actor.source === 'web' ? 'site' : actor.source === 'minecraft' ? 'server' : 'system',
      actorUserId: actor.source === 'system' ? null : actor.userId,
      actorMinecraftUuid: actor.source === 'minecraft' ? (actor.minecraft?.uuid ?? null) : null,
      actorMinecraftName: actor.source === 'minecraft' ? (actor.minecraft?.username ?? null) : null,
      targetUserId: entry.targetUserId ?? null,
      targetMinecraftUuid: entry.targetMinecraftUuid ?? null,
      data: entry.data ?? {},
    })
    .returning({ id: audit.id });
  return row!.id;
}

/**
 * Records what a nightly job did, as the site itself. Counts are in `data`; a night when every
 * count is zero leaves no entry, since nothing changed.
 */
async function recordJob(action: AuditAction, data: Record<string, unknown>): Promise<void> {
  if (!Object.values(data).some((value) => typeof value === 'number' && value > 0)) return;
  await db.transaction((tx) => record(tx, { action, actor: { source: 'system' }, data }));
}

/** How long entries are kept. Bans, notes and warnings live in their own tables. */
export const AUDIT_RETENTION_MONTHS = 24;

/**
 * Deletes entries older than 24 months and records one `system` entry with the count. Returns how
 * many were deleted. The entry it records is new, so it stays.
 */
async function prune(now = new Date()): Promise<number> {
  const cutoff = new Date(now);
  cutoff.setUTCMonth(cutoff.getUTCMonth() - AUDIT_RETENTION_MONTHS);
  return db.transaction(async (tx) => {
    const removed = await tx.delete(audit).where(lt(audit.at, cutoff)).returning({ id: audit.id });
    if (removed.length) {
      await record(tx, {
        action: 'settings.activityPrune',
        actor: { source: 'system' },
        data: { removed: removed.length },
      });
    }
    return removed.length;
  });
}

/**
 * Empties the Minecraft UUIDs the log holds for accounts about to be deleted. The user IDs go by
 * themselves (their foreign keys set them to null), but a UUID has no foreign key to follow, so the
 * deletion calls this first, in its transaction.
 */
async function forgetPeople(tx: Tx, userIds: string[]): Promise<void> {
  if (!userIds.length) return;
  await tx
    .update(audit)
    .set({ targetMinecraftUuid: null })
    .where(inArray(audit.targetUserId, userIds));
  await tx
    .update(audit)
    .set({ actorMinecraftUuid: null, actorMinecraftName: null })
    .where(inArray(audit.actorUserId, userIds));
}

export const auditService = { record, recordJob, forgetPeople, prune };
