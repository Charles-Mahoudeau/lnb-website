import { and, eq, inArray, isNull, lte, gte, or, sql } from 'drizzle-orm';

import {
  minecraftAccount,
  playtimeClosure,
  playtimeExemption,
  playtimeGrant,
  user,
  wardenPlayer,
} from '~~/server/db/schema';

import { closureAppliesTo } from './closure-scope';
import { resolveConfig } from './rules';
import type { ClosureRange, PlaytimeConfig, PlaytimeOverrides } from './rules';
import { playtimeSettingsService } from './settings';
import type { Db } from './shared';

import type { PlaytimeMode } from '#shared/schemas/playtime';
import { addDays, parisDate } from '#shared/utils/paris-time';

/** Everything the rules need to know about one player. */
export interface PlayerContext {
  userId: string;
  tenantId: string;
  /** The mode from the settings. Callers apply the `playtime` flag on top (`activeMode`). */
  mode: PlaytimeMode;
  config: PlaytimeConfig;
  closures: ClosureRange[];
  /** The whole LNB account is exempt. */
  exemptUser: boolean;
  /** Exempt Minecraft accounts. */
  exemptUuids: Set<string>;
  /** Extra seconds granted, by week. */
  grantedByWeek: Record<string, number>;
}

/**
 * Loads a player's effective rules: settings resolved for their school and overrides, the closures
 * that apply to them around `now` (a month each way covers any week and a session), exemptions and
 * grants. An event closure applies to everyone or to the players holding a place (see
 * `closureAppliesTo`).
 */
async function load(dbx: Db, userId: string, now: number): Promise<PlayerContext | null> {
  const [row] = await dbx
    .select({
      tenantId: user.tenantId,
      allowanceSeconds: wardenPlayer.playtimeAllowanceSeconds,
      graceSeconds: wardenPlayer.playtimeGraceSeconds,
      warningsMinutes: wardenPlayer.playtimeWarningsMinutes,
    })
    .from(user)
    .leftJoin(wardenPlayer, eq(wardenPlayer.userId, user.id))
    .where(eq(user.id, userId));
  if (!row) return null;

  const settings = await playtimeSettingsService.get();
  const player: PlaytimeOverrides = {
    allowanceSeconds: row.allowanceSeconds,
    graceSeconds: row.graceSeconds,
    warningsMinutes: row.warningsMinutes,
  };
  const config = resolveConfig(settings.config, settings.schools.get(row.tenantId), player);

  const today = parisDate(now);
  const closures = await dbx
    .select({ startsOn: playtimeClosure.startsOn, endsOn: playtimeClosure.endsOn })
    .from(playtimeClosure)
    .where(
      and(
        lte(playtimeClosure.startsOn, addDays(today, 40)),
        gte(playtimeClosure.endsOn, addDays(today, -40)),
        closureAppliesTo(row.tenantId, userId),
      ),
    );

  const exemptions = await dbx
    .select({ userId: playtimeExemption.userId, minecraftUuid: playtimeExemption.minecraftUuid })
    .from(playtimeExemption)
    .where(
      and(
        isNull(playtimeExemption.revokedAt),
        // ISO string: node-postgres writes raw Date parameters in local time.
        or(
          isNull(playtimeExemption.until),
          sql`${playtimeExemption.until} > ${new Date(now).toISOString()}::timestamp`,
        ),
        or(
          eq(playtimeExemption.userId, userId),
          inArray(
            playtimeExemption.minecraftUuid,
            dbx
              .select({ uuid: minecraftAccount.uuid })
              .from(minecraftAccount)
              .where(eq(minecraftAccount.userId, userId)),
          ),
        ),
      ),
    );

  const grants = await dbx
    .select({ weekStart: playtimeGrant.weekStart, seconds: playtimeGrant.seconds })
    .from(playtimeGrant)
    .where(and(eq(playtimeGrant.userId, userId), isNull(playtimeGrant.revokedAt)));
  const grantedByWeek: Record<string, number> = {};
  for (const grant of grants) {
    grantedByWeek[grant.weekStart] = (grantedByWeek[grant.weekStart] ?? 0) + grant.seconds;
  }

  return {
    userId,
    tenantId: row.tenantId,
    mode: settings.mode,
    config,
    closures,
    exemptUser: exemptions.some((e) => e.userId !== null),
    exemptUuids: new Set(exemptions.flatMap((e) => (e.minecraftUuid ? [e.minecraftUuid] : []))),
    grantedByWeek,
  };
}

export const playtimeContextService = { load };
