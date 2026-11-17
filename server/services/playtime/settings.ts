import { eq } from 'drizzle-orm';

import { db } from '~~/server/db';
import { playtimeSchool, playtimeSettings } from '~~/server/db/schema';
import { flagService } from '~~/server/services/flags';

import type { PlaytimeConfig, PlaytimeOverrides } from './rules';
import type { Db } from './shared';

import type { PlaytimeMode } from '#shared/schemas/playtime';

// The rules in force. Reads are cached for a few seconds, like the feature flags and the anticheat
// settings, so a tick or a page costs no query for them. A change clears the cache of this
// instance at once and reaches the others within the TTL.

const CACHE_TTL_MS = 5000;

export interface PlaytimeSettings {
  mode: PlaytimeMode;
  config: PlaytimeConfig;
  schools: Map<string, PlaytimeOverrides>;
}

let cache: { at: number; settings: PlaytimeSettings } | undefined;

/** The global rules and every school's overrides. */
async function get(dbx: Db = db): Promise<PlaytimeSettings> {
  if (dbx === db && cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.settings;
  const [row] = await dbx.select().from(playtimeSettings).where(eq(playtimeSettings.id, 1));
  // The migration inserts the row, so this is a broken database.
  if (!row) throw new Error('The playtime settings row is missing.');
  const schools = await dbx.select().from(playtimeSchool);
  const settings: PlaytimeSettings = {
    mode: row.mode,
    config: {
      allowanceSeconds: row.allowanceSeconds,
      schedule: row.schedule,
      graceSeconds: row.graceSeconds,
      warningsMinutes: row.warningsMinutes,
      startWarningsMinutes: row.startWarningsMinutes,
    },
    schools: new Map(
      schools.map(({ tenantId, ...overrides }) => [
        tenantId,
        {
          allowanceSeconds: overrides.allowanceSeconds,
          schedule: overrides.schedule,
          graceSeconds: overrides.graceSeconds,
          warningsMinutes: overrides.warningsMinutes,
          startWarningsMinutes: overrides.startWarningsMinutes,
        },
      ]),
    ),
  };
  if (dbx === db) cache = { at: Date.now(), settings };
  return settings;
}

/** Forgets the cached rules, after a change. */
function clearCache() {
  cache = undefined;
}

/**
 * What the limit does right now: the mode, or `off` when the `playtime` flag is off. The flag is
 * the kill switch, so it wins over the mode.
 */
async function activeMode(): Promise<PlaytimeMode> {
  if (!(await flagService.isEnabled('playtime'))) return 'off';
  return (await get()).mode;
}

export const playtimeSettingsService = { get, clearCache, activeMode };
