import { and, eq, inArray, sql } from 'drizzle-orm';

import { anticheatPlayer, anticheatPlayerEvent } from '~~/server/db/schema';

import { applyPlayerEvent, playerBandOf, playtimeGain } from './rules';
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

/** The kinds that count as a penalty for the playtime gain of a session. */
const PENALTY_KINDS: readonly AnticheatPlayerEventKind[] = [
  'challengeWrong',
  'challengeMissed',
  'modSetChanged',
  'channelMismatch',
  'modlistIncomplete',
  'bulkPenalty',
];

/**
 * Adds the trust a closed session earned: whole hours played, up to a daily cap (UTC days) and
 * nothing when the session had a penalty. Called when a session ends. Skipped with the mode off.
 */
async function creditPlaytime(
  tx: Tx,
  session: { id: string; userId: string; seconds: number },
): Promise<void> {
  const { mode, rules } = await anticheatSettingsService.get();
  if (mode === 'off') return;
  // Lock the player first: the gain depends on what the player earned today.
  await ensure(tx, session.userId);

  const penalties = await tx
    .select({ id: anticheatPlayerEvent.id })
    .from(anticheatPlayerEvent)
    .where(
      and(
        eq(anticheatPlayerEvent.sessionId, session.id),
        inArray(anticheatPlayerEvent.kind, [...PENALTY_KINDS]),
      ),
    )
    .limit(1);
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const [today] = await tx
    .select({
      gained: sql<number>`coalesce(sum(${anticheatPlayerEvent.delta}), 0)`.mapWith(Number),
    })
    .from(anticheatPlayerEvent)
    .where(
      and(
        eq(anticheatPlayerEvent.userId, session.userId),
        eq(anticheatPlayerEvent.kind, 'playtime'),
        eq(anticheatPlayerEvent.applied, true),
        // As an ISO string: node-postgres writes raw Dates in local time, and the column holds UTC.
        sql`${anticheatPlayerEvent.at} >= ${dayStart.toISOString()}::timestamp`,
      ),
    );
  const gain = playtimeGain(session.seconds, today?.gained ?? 0, penalties.length > 0, rules);
  if (gain === 0) return;
  await record(tx, {
    userId: session.userId,
    sessionId: session.id,
    kind: 'playtime',
    delta: gain,
    data: { seconds: session.seconds },
  });
}

export const anticheatPlayerService = { ensure, get, record, creditPlaytime };
