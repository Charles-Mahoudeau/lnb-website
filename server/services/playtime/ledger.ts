import { and, eq, gt, inArray, isNull, sql } from 'drizzle-orm';

import { playtimeLedger, wardenSession } from '~~/server/db/schema';

import { playtimeContextService } from './context';
import type { PlayerContext } from './context';
import { advanceLedger, tailByWeek, takeBack, weekBounds, weekStart } from './rules';
import type { LedgerDelta } from './rules';
import { playtimeSettingsService } from './settings';
import type { Tx } from './shared';

import type { PlaytimeMode } from '#shared/schemas/playtime';

// The ledger: what each session played in each week, by what it counted as. It is advanced as time
// passes (the tick, a login, a session closing) and never recounted, so a rule change applies from
// the moment it is saved. See docs/playtime.md.

interface SessionRef {
  id: string;
  userId: string;
  minecraftUuid: string;
  startedAt: Date;
}

/** One player's ledger work at a time, so two sessions of theirs never both read the same total. */
async function lockUser(tx: Tx, userId: string) {
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${'playtime:' + userId}))`);
}

/** The instant up to which a session has been counted. */
async function countedUntil(tx: Tx, session: SessionRef): Promise<number> {
  const rows = await tx
    .select({ at: playtimeLedger.countedUntil })
    .from(playtimeLedger)
    .where(eq(playtimeLedger.sessionId, session.id));
  return Math.max(session.startedAt.getTime(), ...rows.map((row) => row.at.getTime()));
}

/** The counted seconds of a player in each of the given weeks, over every account and session. */
async function usedByWeek(
  tx: Tx,
  userId: string,
  weeks: string[],
): Promise<Record<string, number>> {
  if (weeks.length === 0) return {};
  const rows = await tx
    .select({
      week: playtimeLedger.weekStart,
      counted: sql<number>`coalesce(sum(${playtimeLedger.countedSeconds}), 0)::int`,
    })
    .from(playtimeLedger)
    .where(and(eq(playtimeLedger.userId, userId), inArray(playtimeLedger.weekStart, weeks)))
    .groupBy(playtimeLedger.weekStart);
  return Object.fromEntries(rows.map((row) => [row.week, row.counted]));
}

function weeksBetween(from: number, to: number): string[] {
  const weeks: string[] = [];
  let cursor = from;
  while (cursor < to) {
    const week = weekStart(cursor);
    weeks.push(week);
    cursor = weekBounds(week).to;
  }
  return weeks;
}

/** Whether a session's time uses no allowance: an exempt account, or no limit at all. */
function isUnlimited(context: PlayerContext, mode: PlaytimeMode, uuid: string): boolean {
  return mode === 'off' || context.exemptUser || context.exemptUuids.has(uuid);
}

/**
 * Counts one session up to `to` and adds the result to its ledger rows. The caller holds the
 * player's lock.
 */
async function advanceSession(
  tx: Tx,
  session: SessionRef,
  context: PlayerContext,
  mode: PlaytimeMode,
  to: number,
): Promise<void> {
  const from = await countedUntil(tx, session);
  if (to <= from) return;
  const weeks = weeksBetween(from, to);
  const deltas = advanceLedger({
    from,
    to,
    config: context.config,
    closures: context.closures,
    unlimited: isUnlimited(context, mode, session.minecraftUuid),
    usedByWeek: await usedByWeek(tx, session.userId, weeks),
    grantedByWeek: context.grantedByWeek,
  });
  for (const delta of deltas) {
    // The row of an earlier week is counted up to the end of that week.
    const until = Math.min(to, weekBounds(delta.week).to);
    await tx
      .insert(playtimeLedger)
      .values({
        sessionId: session.id,
        weekStart: delta.week,
        userId: session.userId,
        minecraftUuid: session.minecraftUuid,
        countedSeconds: delta.countedSeconds,
        graceSeconds: delta.graceSeconds,
        overSeconds: delta.overSeconds,
        freeSeconds: delta.freeSeconds,
        countedUntil: new Date(until),
      })
      .onConflictDoUpdate({
        target: [playtimeLedger.sessionId, playtimeLedger.weekStart],
        set: {
          countedSeconds: sql`${playtimeLedger.countedSeconds} + ${delta.countedSeconds}`,
          graceSeconds: sql`${playtimeLedger.graceSeconds} + ${delta.graceSeconds}`,
          overSeconds: sql`${playtimeLedger.overSeconds} + ${delta.overSeconds}`,
          freeSeconds: sql`${playtimeLedger.freeSeconds} + ${delta.freeSeconds}`,
          countedUntil: new Date(until),
        },
      });
  }
}

/**
 * Counts every open session of a player up to `now`, in whole seconds from where each stopped, so
 * the next call carries on without losing a fraction. `mode` is the active mode (`off` when the
 * flag is off): with it off, time is only recorded as free. Sessions with no heartbeat since
 * `heartbeatAfter` are left, since closing them takes their tail back anyway.
 */
async function advanceUser(
  tx: Tx,
  userId: string,
  now: number,
  mode: PlaytimeMode,
  heartbeatAfter?: Date,
): Promise<void> {
  await lockUser(tx, userId);
  const sessions = await tx
    .select({
      id: wardenSession.id,
      userId: wardenSession.userId,
      minecraftUuid: wardenSession.minecraftUuid,
      startedAt: wardenSession.startedAt,
    })
    .from(wardenSession)
    .where(
      and(
        eq(wardenSession.userId, userId),
        isNull(wardenSession.endedAt),
        heartbeatAfter ? gt(wardenSession.lastHeartbeatAt, heartbeatAfter) : undefined,
      ),
    );
  if (sessions.length === 0) return;
  const context = await playtimeContextService.load(tx, userId, now);
  if (!context) return;
  for (const session of sessions) {
    const from = await countedUntil(tx, session);
    const to = from + Math.floor((now - from) / 1000) * 1000;
    await advanceSession(tx, session, context, mode, to);
  }
}

/**
 * Closes a session's ledger at the instant it ended. A session that ended normally is counted up
 * to then. One closed for a missing heartbeat ended at its last heartbeat, so what the tick counted
 * after that is taken back: a crash never costs the player.
 */
async function settle(tx: Tx, session: SessionRef, endedAt: Date): Promise<void> {
  await lockUser(tx, session.userId);
  const mode = await playtimeSettingsService.activeMode();
  const context = await playtimeContextService.load(tx, session.userId, endedAt.getTime());
  if (!context) return;
  const until = await countedUntil(tx, session);
  const end = endedAt.getTime();
  if (end > until) {
    await advanceSession(tx, session, context, mode, end);
    return;
  }
  if (end === until) return;

  const unlimited = isUnlimited(context, mode, session.minecraftUuid);
  for (const tail of tailByWeek(end, until, context.config, context.closures, unlimited)) {
    const [row] = await tx
      .select()
      .from(playtimeLedger)
      .where(
        and(eq(playtimeLedger.sessionId, session.id), eq(playtimeLedger.weekStart, tail.week)),
      );
    if (!row) continue;
    const next: LedgerDelta = takeBack(row, tail);
    await tx
      .update(playtimeLedger)
      .set({ ...next, countedUntil: new Date(Math.min(row.countedUntil.getTime(), end)) })
      .where(
        and(eq(playtimeLedger.sessionId, session.id), eq(playtimeLedger.weekStart, tail.week)),
      );
  }
}

export const playtimeLedgerService = { advanceUser, settle, usedByWeek };
