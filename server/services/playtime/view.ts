import { and, eq, isNull, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import { minecraftAccount, playtimeLedger, wardenPlayer } from '~~/server/db/schema';

import { playtimeContextService } from './context';
import { evaluate, hoursLines, weekStart } from './rules';
import { playtimeSettingsService } from './settings';

import type { PlaytimeMe } from '#shared/schemas/playtime';

const iso = (instant: number | null) => (instant === null ? null : new Date(instant).toISOString());

/**
 * The player's week for the Minecraft account page: where they stand, what they played and which
 * hours are restricted. Reads the ledger as the tick left it, up to five seconds behind.
 */
async function me(userId: string, now = Date.now()): Promise<PlaytimeMe | null> {
  const context = await playtimeContextService.load(db, userId, now);
  if (!context) return null;
  const mode = await playtimeSettingsService.activeMode();
  const week = weekStart(now);

  const accounts = await db
    .select({
      uuid: minecraftAccount.uuid,
      username: minecraftAccount.username,
      playtimeSeconds: minecraftAccount.playtimeSeconds,
    })
    .from(minecraftAccount)
    .where(and(eq(minecraftAccount.userId, userId), isNull(minecraftAccount.unlinkedAt)))
    .orderBy(minecraftAccount.linkedAt);
  const [transferred] = await db
    .select({ seconds: wardenPlayer.transferredPlaytimeSeconds })
    .from(wardenPlayer)
    .where(eq(wardenPlayer.userId, userId));

  const rows = await db
    .select({
      uuid: playtimeLedger.minecraftUuid,
      counted: sql<number>`sum(${playtimeLedger.countedSeconds})::int`,
      played: sql<number>`sum(${playtimeLedger.countedSeconds} + ${playtimeLedger.graceSeconds} + ${playtimeLedger.overSeconds} + ${playtimeLedger.freeSeconds})::int`,
    })
    .from(playtimeLedger)
    .where(and(eq(playtimeLedger.userId, userId), eq(playtimeLedger.weekStart, week)))
    .groupBy(playtimeLedger.minecraftUuid);
  const byAccount = new Map(rows.map((row) => [row.uuid, row]));

  const used = rows.reduce((sum, row) => sum + row.counted, 0);
  const played = rows.reduce((sum, row) => sum + row.played, 0);
  // The page is "exempt" when nothing of the account is limited.
  const allExempt =
    context.exemptUser ||
    (accounts.length > 0 && accounts.every((account) => context.exemptUuids.has(account.uuid)));
  const evaluation = evaluate({
    now,
    mode,
    config: context.config,
    closures: context.closures,
    usedSeconds: used,
    grantedSeconds: context.grantedByWeek[week] ?? 0,
    exempt: allExempt,
  });

  return {
    mode,
    state: evaluation.state,
    reason: evaluation.reason,
    weekStart: week,
    playedSeconds: played,
    totalPlayedSeconds:
      accounts.reduce((sum, account) => sum + account.playtimeSeconds, 0) +
      (transferred?.seconds ?? 0),
    allowanceSeconds: evaluation.allowanceSeconds,
    usedSeconds: evaluation.usedSeconds,
    remainingSeconds: evaluation.remainingSeconds,
    percentUsed:
      evaluation.allowanceSeconds > 0
        ? Math.min(100, Math.round((evaluation.usedSeconds / evaluation.allowanceSeconds) * 100))
        : 100,
    windowEndsAt: iso(evaluation.windowEndsAt),
    nextWindowStartsAt: iso(evaluation.nextWindowStartsAt),
    graceEndsAt: iso(evaluation.graceEndsAt),
    resumesAt: iso(evaluation.resumesAt),
    resetsAt: iso(evaluation.resetsAt)!,
    nextChangeAt: iso(evaluation.nextChangeAt),
    hours: hoursLines(context.config.schedule),
    accounts: accounts.map((account) => ({
      uuid: account.uuid,
      username: account.username,
      exempt: context.exemptUser || context.exemptUuids.has(account.uuid),
      playedSeconds: byAccount.get(account.uuid)?.played ?? 0,
    })),
  };
}

export const playtimeViewService = { me };
