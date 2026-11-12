import { and, eq } from 'drizzle-orm';

import { anticheatPlayer, anticheatPlayerEvent } from '~~/server/db/schema';

import { applyPlayerEvent, playerBandOf } from './rules';
import type { SessionEvent } from './rules';
import { anticheatSettingsService } from './settings';
import type { Db, Tx } from './shared';

import type {
  AnticheatPlayerEventKind,
  AnticheatPlayerSummary,
  AnticheatServerEventKind,
} from '#shared/schemas/anticheat';

// The trust score of an LNB account (not of a Minecraft account), and its timeline.
// See docs/anticheat.md.

/** Kinds an admin writes: they always apply, even in observe mode. */
const ADMIN_KINDS: readonly AnticheatPlayerEventKind[] = [
  'adminAdjust',
  'bulkPenalty',
  'holdSet',
  'holdCleared',
];

export interface PlayerState {
  userId: string;
  score: number;
  manualHold: boolean;
}

/**
 * The player's trust row, created at the starting score on first need and locked until the
 * transaction ends, so two reports of one player never race on the score.
 */
async function ensure(tx: Tx, userId: string): Promise<PlayerState> {
  const { rules } = await anticheatSettingsService.get();
  await tx
    .insert(anticheatPlayer)
    .values({ userId, score: rules.player.start })
    .onConflictDoNothing();
  const [row] = await tx
    .select({
      userId: anticheatPlayer.userId,
      score: anticheatPlayer.score,
      manualHold: anticheatPlayer.manualHold,
    })
    .from(anticheatPlayer)
    .where(eq(anticheatPlayer.userId, userId))
    .for('update');
  return row!;
}

/** The player's score and band, or the starting score for a player never reported. */
async function get(database: Db, userId: string): Promise<PlayerState & AnticheatPlayerSummary> {
  const { rules } = await anticheatSettingsService.get();
  const [row] = await database
    .select({ score: anticheatPlayer.score, manualHold: anticheatPlayer.manualHold })
    .from(anticheatPlayer)
    .where(eq(anticheatPlayer.userId, userId));
  const score = row?.score ?? rules.player.start;
  return {
    userId,
    score,
    manualHold: row?.manualHold ?? false,
    band: playerBandOf(score, rules),
  };
}

export interface RecordInput {
  userId: string;
  sessionId?: string | null;
  kind: AnticheatPlayerEventKind;
  /** The server's idempotency key. An event already stored is skipped. */
  eventId?: string | null;
  data?: Record<string, unknown>;
  actorUserId?: string | null;
  /** For the kinds the site doesn't compute: playtime and the admin ones. */
  delta?: number;
}

export interface RecordResult {
  /** False when the event was already stored. */
  recorded: boolean;
  delta: number;
  /** In observe mode the event is stored but the score stays. */
  applied: boolean;
  score: number;
}

/**
 * Stores an event on the timeline and moves the score. In observe mode the server's events are
 * recorded with `applied = false` and the score stays; the admin ones always apply. Missed
 * challenges and the incomplete modlist are capped per session by `applyPlayerEvent`.
 */
async function record(tx: Tx, input: RecordInput): Promise<RecordResult> {
  const { mode, rules } = await anticheatSettingsService.get();
  const player = await ensure(tx, input.userId);

  if (input.eventId) {
    const [known] = await tx
      .select({ id: anticheatPlayerEvent.id })
      .from(anticheatPlayerEvent)
      .where(eq(anticheatPlayerEvent.eventId, input.eventId));
    if (known) return { recorded: false, delta: 0, applied: false, score: player.score };
  }

  let delta = input.delta ?? 0;
  if (isComputed(input.kind)) {
    const sessionEvents: SessionEvent[] = input.sessionId
      ? await tx
          .select({ kind: anticheatPlayerEvent.kind, delta: anticheatPlayerEvent.delta })
          .from(anticheatPlayerEvent)
          .where(
            and(
              eq(anticheatPlayerEvent.userId, input.userId),
              eq(anticheatPlayerEvent.sessionId, input.sessionId),
            ),
          )
      : [];
    delta = applyPlayerEvent(player.score, input.kind, sessionEvents, rules);
  }

  const applied = ADMIN_KINDS.includes(input.kind) || mode === 'enforce';
  const score = applied ? Math.min(100, Math.max(0, player.score + delta)) : player.score;
  await tx.insert(anticheatPlayerEvent).values({
    userId: input.userId,
    sessionId: input.sessionId ?? null,
    eventId: input.eventId ?? null,
    kind: input.kind,
    delta,
    applied,
    scoreAfter: score,
    data: input.data ?? {},
    actorUserId: input.actorUserId ?? null,
  });
  if (score !== player.score) {
    await tx
      .update(anticheatPlayer)
      .set({ score, updatedAt: new Date() })
      .where(eq(anticheatPlayer.userId, input.userId));
  }
  return { recorded: true, delta, applied, score };
}

function isComputed(
  kind: AnticheatPlayerEventKind,
): kind is AnticheatServerEventKind | 'modlistIncomplete' {
  return (
    kind === 'challengeWrong' ||
    kind === 'challengeMissed' ||
    kind === 'modSetChanged' ||
    kind === 'channelMismatch' ||
    kind === 'modlistIncomplete'
  );
}

export const anticheatPlayerService = { ensure, get, record };
