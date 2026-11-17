import { and, gt, isNull } from 'drizzle-orm';

import { db } from '~~/server/db';
import { wardenSession } from '~~/server/db/schema';
import { SESSION_TIMEOUT_MS } from '~~/server/services/warden/rules';

import { playtimeLedgerService } from './ledger';
import { playtimeSettingsService } from './settings';
import type { Tx } from './shared';

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
 * One pass over the players who are online: counts their time up to now. With the limit off (the
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
    for (const { userId } of online) {
      try {
        await db.transaction((tx) =>
          playtimeLedgerService.advanceUser(tx, userId, now, mode, heartbeatAfter),
        );
      } catch (error) {
        console.error('[playtime] tick failed for a player:', error);
      }
    }
    return { players: online.length };
  } finally {
    ticking = false;
  }
}

export const playtimeService = { advanceAtLogin, settleClosed, tick };
