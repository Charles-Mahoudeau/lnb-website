import { eq } from 'drizzle-orm';

import { db } from '~~/server/db';
import { anticheatRulesVersion, anticheatSettings } from '~~/server/db/schema';
import { wardenAuditService } from '~~/server/services/warden/audit';

import type { AnticheatMode, AnticheatRules } from '#shared/schemas/anticheat';

// The mode and the rules in force. Reads are cached for a few seconds, like the feature flags, so a
// report costs no query for them. A change clears the cache of this instance at once and reaches
// the others within the TTL.

const CACHE_TTL_MS = 10_000;

export interface AnticheatConfig {
  mode: AnticheatMode;
  rulesVersion: number;
  rules: AnticheatRules;
  updatedAt: Date;
}

let cache: { at: number; config: AnticheatConfig } | undefined;

async function get(): Promise<AnticheatConfig> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.config;
  const [row] = await db
    .select({
      mode: anticheatSettings.mode,
      rulesVersion: anticheatSettings.rulesVersion,
      rules: anticheatRulesVersion.rules,
      updatedAt: anticheatSettings.updatedAt,
    })
    .from(anticheatSettings)
    .innerJoin(
      anticheatRulesVersion,
      eq(anticheatRulesVersion.version, anticheatSettings.rulesVersion),
    );
  // The migration inserts the row, so this is a broken database.
  if (!row) throw new Error('The anticheat settings row is missing.');
  cache = { at: Date.now(), config: row };
  return row;
}

/** The rules of an older version, to explain an old breakdown. */
async function rulesFor(version: number): Promise<AnticheatRules | null> {
  const [row] = await db
    .select({ rules: anticheatRulesVersion.rules })
    .from(anticheatRulesVersion)
    .where(eq(anticheatRulesVersion.version, version));
  return row?.rules ?? null;
}

/**
 * Changes the mode, the rules, or both. New rules make a new version and the settings point at it;
 * an unchanged object makes none. Audited as `anticheat.settings`.
 */
async function update(input: {
  actorId: string;
  mode?: AnticheatMode;
  rules?: AnticheatRules;
}): Promise<AnticheatConfig> {
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select({
        mode: anticheatSettings.mode,
        rulesVersion: anticheatSettings.rulesVersion,
        rules: anticheatRulesVersion.rules,
      })
      .from(anticheatSettings)
      .innerJoin(
        anticheatRulesVersion,
        eq(anticheatRulesVersion.version, anticheatSettings.rulesVersion),
      )
      .for('update', { of: anticheatSettings });
    if (!current) throw new Error('The anticheat settings row is missing.');

    const modeChanged = input.mode !== undefined && input.mode !== current.mode;
    const rulesChanged =
      input.rules !== undefined && JSON.stringify(input.rules) !== JSON.stringify(current.rules);
    if (!modeChanged && !rulesChanged) return;

    let rulesVersion = current.rulesVersion;
    if (rulesChanged && input.rules) {
      const [created] = await tx
        .insert(anticheatRulesVersion)
        .values({ rules: input.rules, createdByUserId: input.actorId })
        .returning({ version: anticheatRulesVersion.version });
      rulesVersion = created!.version;
    }
    await tx
      .update(anticheatSettings)
      .set({
        mode: input.mode ?? current.mode,
        rulesVersion,
        updatedAt: new Date(),
        updatedByUserId: input.actorId,
      })
      .where(eq(anticheatSettings.id, 1));
    await wardenAuditService.record(tx, {
      action: 'anticheat.settings',
      actor: { source: 'web', userId: input.actorId },
      data: {
        ...(modeChanged ? { mode: { from: current.mode, to: input.mode } } : {}),
        ...(rulesChanged ? { rulesVersion: { from: current.rulesVersion, to: rulesVersion } } : {}),
      },
    });
  });
  cache = undefined;
  return get();
}

export const anticheatSettingsService = { get, rulesFor, update };
