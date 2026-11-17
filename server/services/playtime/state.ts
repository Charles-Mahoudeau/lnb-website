import { playtimeContextService } from './context';
import type { PlayerContext } from './context';
import { playtimeLedgerService } from './ledger';
import { evaluate, weekStart } from './rules';
import type { Evaluation } from './rules';
import type { Db } from './shared';

import type { PlaytimeMode } from '#shared/schemas/playtime';
import type { WardenPlaytime, WardenPlaytimeBlock } from '#shared/schemas/warden';

// A player's state as the Minecraft server sees it, one Minecraft account at a time: exemptions are
// per account, so two accounts of one player can stand differently. See docs/playtime.md.

const iso = (instant: number | null) => (instant === null ? null : new Date(instant).toISOString());

export interface AccountState {
  evaluation: Evaluation;
  playtime: WardenPlaytime;
}

/** The object the server gets at login, in the heartbeat answer and in `playtimeUpdate`. */
export function toWardenPlaytime(evaluation: Evaluation, mode: PlaytimeMode): WardenPlaytime {
  const { state } = evaluation;
  return {
    enforced: mode === 'enforce',
    limited: state !== 'unlimited',
    // Inside a restricted window, whatever the allowance says.
    counting: state === 'counting' || state === 'grace' || state === 'blocked',
    remainingSeconds: evaluation.remainingSeconds,
    limitSeconds: evaluation.allowanceSeconds,
    windowEndsAt: iso(evaluation.windowEndsAt),
    nextWindowStartsAt: iso(evaluation.nextWindowStartsAt),
    grace: state === 'grace',
    graceEndsAt: iso(evaluation.graceEndsAt),
  };
}

/**
 * What a denied or kicked player is told: when they can join again. The window's end only counts
 * when it comes before the reset, since the reset gives the allowance back anyway.
 */
export function toBlock(evaluation: Evaluation): WardenPlaytimeBlock {
  const ends = evaluation.resumesAt;
  return {
    windowEndsAt: ends !== null && ends < evaluation.resetsAt ? iso(ends) : null,
    resetsAt: iso(evaluation.resetsAt)!,
  };
}

/** The shown state when something goes wrong: nothing limited, so nobody is held back by a bug. */
export function fallbackPlaytime(): WardenPlaytime {
  return {
    enforced: false,
    limited: false,
    counting: false,
    remainingSeconds: 0,
    limitSeconds: 0,
    windowEndsAt: null,
    nextWindowStartsAt: null,
    grace: false,
    graceEndsAt: null,
  };
}

/**
 * The state of each of a player's Minecraft accounts at `now`. The time used is the player's, over
 * all their accounts, as the ledger has it: callers advance the ledger first when they need it
 * exact. Returns an empty map for an unknown player.
 */
async function forAccounts(
  dbx: Db,
  userId: string,
  uuids: string[],
  now: number,
  mode: PlaytimeMode,
  preloaded?: PlayerContext | null,
): Promise<Map<string, AccountState>> {
  const out = new Map<string, AccountState>();
  const context = preloaded ?? (await playtimeContextService.load(dbx, userId, now));
  if (!context || uuids.length === 0) return out;
  const week = weekStart(now);
  const used = (await playtimeLedgerService.usedByWeek(dbx, userId, [week]))[week] ?? 0;
  for (const uuid of uuids) {
    const evaluation = evaluate({
      now,
      mode,
      config: context.config,
      closures: context.closures,
      usedSeconds: used,
      grantedSeconds: context.grantedByWeek[week] ?? 0,
      exempt: context.exemptUser || context.exemptUuids.has(uuid),
    });
    out.set(uuid, { evaluation, playtime: toWardenPlaytime(evaluation, mode) });
  }
  return out;
}

export const playtimeStateService = { forAccounts };
