import { eq } from 'drizzle-orm';

import { db } from '~~/server/db';
import { featureFlag, user } from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';

import { FLAG_DEFINITIONS, resolveFlags } from '#shared/flags';
import type { FlagKey } from '#shared/flags';
import type { AdminFlag } from '#shared/schemas/flags';

// Feature flags: which exist is in shared/flags.ts, and the database holds the admins' changes.
// Reads are cached for a few seconds, so gating a request costs no query. A change clears the
// cache of this instance at once and reaches the others within the TTL.

const CACHE_TTL_MS = 10_000;

let cache: { at: number; overrides: Map<string, boolean> } | undefined;

async function overrides(): Promise<Map<string, boolean>> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.overrides;
  const rows = await db.select().from(featureFlag);
  cache = { at: Date.now(), overrides: new Map(rows.map((row) => [row.key, row.enabled])) };
  return cache.overrides;
}

/** The effective state of every flag. */
async function states(): Promise<Record<FlagKey, boolean>> {
  return resolveFlags(await overrides());
}

async function isEnabled(key: FlagKey): Promise<boolean> {
  return (await states())[key];
}

/** Every flag with its own switch and what is applied, for the admin page. */
async function list(): Promise<AdminFlag[]> {
  const rows = await db
    .select({ flag: featureFlag, updatedByName: user.name })
    .from(featureFlag)
    .leftJoin(user, eq(user.id, featureFlag.updatedByUserId));
  const byKey = new Map(rows.map((row) => [row.flag.key, row]));
  const effective = resolveFlags(new Map(rows.map((row) => [row.flag.key, row.flag.enabled])));
  return FLAG_DEFINITIONS.map((definition) => {
    const row = byKey.get(definition.key);
    return {
      key: definition.key,
      parent: 'parent' in definition ? definition.parent : null,
      enabled: row?.flag.enabled ?? true,
      effective: effective[definition.key],
      updatedAt: row ? row.flag.updatedAt.toISOString() : null,
      updatedByName: row?.updatedByName ?? null,
    };
  });
}

/** Switches a flag, and writes admin_audit. A no-op change writes nothing. */
async function set(input: { key: FlagKey; enabled: boolean; actorId: string }): Promise<void> {
  const { key, enabled, actorId } = input;
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(featureFlag).where(eq(featureFlag.key, key));
    if ((current?.enabled ?? true) === enabled) return;
    await tx
      .insert(featureFlag)
      .values({ key, enabled, updatedByUserId: actorId })
      .onConflictDoUpdate({
        target: featureFlag.key,
        set: { enabled, updatedAt: new Date(), updatedByUserId: actorId },
      });
    await adminAuditService.record(tx, {
      action: 'flag.update',
      actorUserId: actorId,
      targetUserId: null,
      data: { key, enabled },
    });
  });
  cache = undefined;
}

export const flagService = { states, isEnabled, list, set };
