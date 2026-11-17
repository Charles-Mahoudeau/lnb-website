import { and, gt, isNull } from 'drizzle-orm';

import { db } from '~~/server/db';
import { wardenSession } from '~~/server/db/schema';
import { SESSION_TIMEOUT_MS } from '~~/server/services/warden/rules';

import { playtimeEnforcementService } from './enforcement';
import { playtimeLedgerService } from './ledger';
import { playtimeSettingsService } from './settings';
import type { Tx } from './shared';
import { fallbackPlaytime, playtimeStateService, toBlock } from './state';

import type { WardenPlaytime, WardenPlaytimeBlock } from '#shared/schemas/warden';

/**
 * Runs a piece of ledger work for a session login or close without ever breaking it: the limit
 * starts in `observe`, so a bug here must not stop a player joining or a session closing. It runs
 * in a savepoint, so a failed statement doesn't abort the caller's transaction.
 */
async function safely(tx: Tx, label: string, work: (tx: Tx) => Promise<void>): Promise<void> {
  try {
    await tx.transaction(work);
  } catch (error) {
    console.error(`[playtime] ${label} failed:`, error);
  }
}

/** Counts a player's open sessions up to now. Used when a player joins. */
async function advanceAtLogin(tx: Tx, userId: string): Promise<void> {
  await safely(tx, 'advance at login', async (inner) => {
    await playtimeLedgerService.advanceUser(
      inner,
      userId,
      Date.now(),
      await playtimeSettingsService.activeMode(),
    );
  });
}

/**
 * Whether a player who is joining is held back by their limit: only in `enforce`, and only when
 * they are out of allowance inside a window and not in grace. Counts their open sessions first, so
 * the total is current. A bug here never denies anyone.
 */
async function loginGate(
  tx: Tx,
  userId: string,
  uuid: string,
): Promise<WardenPlaytimeBlock | null> {
  try {
    const mode = await playtimeSettingsService.activeMode();
    if (mode !== 'enforce') return null;
    return await tx.transaction(async (inner) => {
      const now = Date.now();
      await playtimeLedgerService.advanceUser(inner, userId, now, mode);
      const state = (await playtimeStateService.forAccounts(inner, userId, [uuid], now, mode)).get(
        uuid,
      );
      return state?.evaluation.state === 'blocked' ? toBlock(state.evaluation) : null;
    });
  } catch (error) {
    console.error('[playtime] login gate failed:', error);
    return null;
  }
}

/** The state of a session's account for the login answer. Falls back to "no limit" on a bug. */
async function stateAtLogin(tx: Tx, userId: string, uuid: string): Promise<WardenPlaytime> {
  try {
    return await tx.transaction(async (inner) => {
      const mode = await playtimeSettingsService.activeMode();
      const state = await playtimeStateService.forAccounts(inner, userId, [uuid], Date.now(), mode);
      return state.get(uuid)?.playtime ?? fallbackPlaytime();
    });
  } catch (error) {
    console.error('[playtime] state at login failed:', error);
    return fallbackPlaytime();
  }
}

/** The state of each open session, for the heartbeat answer: a safety net for missed events. */
async function statesOf(
  sessions: { id: string; userId: string; minecraftUuid: string }[],
): Promise<Record<string, WardenPlaytime>> {
  const out: Record<string, WardenPlaytime> = {};
  try {
    const mode = await playtimeSettingsService.activeMode();
    const byUser = Map.groupBy(sessions, (session) => session.userId);
    const now = Date.now();
    for (const [userId, group] of byUser) {
      const states = await playtimeStateService.forAccounts(
        db,
        userId,
        group.map((session) => session.minecraftUuid),
        now,
        mode,
      );
      for (const session of group) {
        const state = states.get(session.minecraftUuid);
        if (state) out[session.id] = state.playtime;
      }
    }
  } catch (error) {
    console.error('[playtime] heartbeat states failed:', error);
  }
  return out;
}

/** Closes the ledger of sessions that just ended, at the instant each ended. */
async function settleClosed(
  tx: Tx,
  sessions: { id: string; userId: string; minecraftUuid: string; startedAt: Date; endedAt: Date }[],
): Promise<void> {
  for (const session of sessions) {
    await safely(tx, 'settle', (inner) =>
      playtimeLedgerService.settle(inner, session, session.endedAt),
    );
  }
}

let ticking = false;

/**
 * One pass over the players who are online: counts their time up to now and, in `enforce`, warns
 * and kicks them. With the limit off (the
 * mode, or the `playtime` flag) it still runs, only to record time as free, so a later switch on
 * doesn't count the gap. Safe to run twice at once: the second is skipped, and the ledger is
 * locked per player anyway.
 */
async function tick(now = Date.now()): Promise<{ players: number }> {
  if (ticking) return { players: 0 };
  ticking = true;
  try {
    const mode = await playtimeSettingsService.activeMode();
    const heartbeatAfter = new Date(now - SESSION_TIMEOUT_MS);
    const online = await db
      .selectDistinct({ userId: wardenSession.userId })
      .from(wardenSession)
      .where(and(isNull(wardenSession.endedAt), gt(wardenSession.lastHeartbeatAt, heartbeatAfter)));
    const open = new Set<string>();
    for (const { userId } of online) {
      try {
        await db.transaction(async (tx) => {
          await playtimeLedgerService.advanceUser(tx, userId, now, mode, heartbeatAfter);
          if (mode !== 'enforce') return;
          // In a savepoint: a bug in the warnings must not undo the counting.
          try {
            await tx.transaction(async (inner) => {
              const ids = await playtimeEnforcementService.enforceUser(
                inner,
                userId,
                now,
                heartbeatAfter,
              );
              for (const id of ids) open.add(id);
            });
          } catch (error) {
            console.error('[playtime] enforcement failed for a player:', error);
          }
        });
      } catch (error) {
        console.error('[playtime] tick failed for a player:', error);
      }
    }
    // Outside `enforce` nothing is remembered, so switching it on starts with silent first looks.
    playtimeEnforcementService.forgetExcept(mode === 'enforce' ? open : new Set());
    return { players: online.length };
  } finally {
    ticking = false;
  }
}

export const playtimeService = {
  advanceAtLogin,
  loginGate,
  stateAtLogin,
  statesOf,
  settleClosed,
  tick,
};
