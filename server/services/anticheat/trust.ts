import { and, desc, eq, isNull } from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  anticheatActionTaken,
  anticheatPlayer,
  anticheatReport,
  wardenSession,
} from '~~/server/db/schema';
import { wardenAuditService } from '~~/server/services/warden/audit';

import { anticheatPlayerService } from './players';
import { anticheatReportService } from './reports';
import { playerBandOf, verdictOf } from './rules';
import { anticheatSettingsService } from './settings';
import { refuse } from './shared';
import type { AnticheatActor } from './shared';

import type {
  AnticheatActionBody,
  AnticheatEventsBody,
  AnticheatEventsResponse,
} from '#shared/schemas/anticheat';

// What changes a player's trust from outside a report: the server's events, the admins, and the
// action log. Kept apart from players.ts, which the Warden session service imports to credit
// playtime and so must not pull in the report service. See docs/anticheat.md.

/**
 * Records the events the Minecraft server sends for an open session, then works the verdicts of
 * the player's open sessions out again. An event already stored is skipped. With the mode off,
 * nothing is stored.
 */
async function serverEvents(body: AnticheatEventsBody): Promise<AnticheatEventsResponse> {
  const { mode, rules } = await anticheatSettingsService.get();
  const [session] = await db
    .select({ userId: wardenSession.userId })
    .from(wardenSession)
    .where(and(eq(wardenSession.id, body.sessionId), isNull(wardenSession.endedAt)));
  if (!session) refuse(404, 'unknownSession');

  if (mode !== 'off') {
    await db.transaction(async (tx) => {
      for (const item of body.events) {
        await anticheatPlayerService.record(tx, {
          userId: session.userId,
          sessionId: body.sessionId,
          kind: item.kind,
          eventId: item.id,
          data: item.data,
        });
      }
    });
    await anticheatReportService.reevaluateForUser(session.userId);
  }

  const player = await anticheatPlayerService.get(db, session.userId);
  const [latest] = await db
    .select({ verdict: anticheatReport.verdict })
    .from(anticheatReport)
    .where(eq(anticheatReport.sessionId, body.sessionId))
    .orderBy(desc(anticheatReport.seq))
    .limit(1);
  const verdict =
    mode === 'off'
      ? { action: 'allow' as const, reasons: [] }
      : (latest?.verdict ?? verdictOf([], player, mode, rules));
  return { player: { score: player.score, band: player.band }, verdict };
}

/** Sets the score by hand, for an admin. */
async function adjust(input: {
  actor: AnticheatActor;
  userId: string;
  score: number;
  reason: string;
}): Promise<void> {
  await db.transaction(async (tx) => {
    const player = await anticheatPlayerService.ensure(tx, input.userId);
    await anticheatPlayerService.record(tx, {
      userId: input.userId,
      kind: 'adminAdjust',
      delta: input.score - player.score,
      data: { reason: input.reason, from: player.score, to: input.score },
      actorUserId: input.actor.source === 'system' ? null : input.actor.userId,
    });
    await wardenAuditService.record(tx, {
      action: 'anticheat.playerAdjust',
      actor: input.actor,
      targetUserId: input.userId,
      data: { reason: input.reason, from: player.score, to: input.score },
    });
  });
  await anticheatReportService.reevaluateForUser(input.userId);
}

/**
 * Holds the player's next join, or clears the hold. Clearing the hold of a player in the held band
 * also lifts the score to the held threshold, so the score doesn't hold the player again.
 */
async function setHold(input: {
  actor: AnticheatActor;
  userId: string;
  hold: boolean;
  reason: string;
}): Promise<void> {
  const { rules } = await anticheatSettingsService.get();
  const actorUserId = input.actor.source === 'system' ? null : input.actor.userId;
  await db.transaction(async (tx) => {
    const player = await anticheatPlayerService.ensure(tx, input.userId);
    await tx
      .update(anticheatPlayer)
      .set(
        input.hold
          ? {
              manualHold: true,
              holdReason: input.reason,
              holdAt: new Date(),
              holdByUserId: actorUserId,
            }
          : { manualHold: false, holdReason: null, holdAt: null, holdByUserId: null },
      )
      .where(eq(anticheatPlayer.userId, input.userId));
    const lift =
      !input.hold && playerBandOf(player.score, rules) === 'held'
        ? rules.player.held - player.score
        : 0;
    await anticheatPlayerService.record(tx, {
      userId: input.userId,
      kind: input.hold ? 'holdSet' : 'holdCleared',
      delta: lift,
      data: { reason: input.reason },
      actorUserId,
    });
    await wardenAuditService.record(tx, {
      action: input.hold ? 'anticheat.hold' : 'anticheat.holdClear',
      actor: input.actor,
      targetUserId: input.userId,
      data: { reason: input.reason },
    });
  });
  await anticheatReportService.reevaluateForUser(input.userId);
}

/**
 * Stores what the Minecraft server did with a verdict. An ended session is accepted, since a
 * refusal ends it. A report that isn't the session's own is left out.
 */
async function recordAction(body: AnticheatActionBody): Promise<void> {
  const [session] = await db
    .select({ userId: wardenSession.userId })
    .from(wardenSession)
    .where(eq(wardenSession.id, body.sessionId));
  if (!session) refuse(404, 'unknownSession');
  const [report] = body.reportId
    ? await db
        .select({ id: anticheatReport.id })
        .from(anticheatReport)
        .where(
          and(eq(anticheatReport.id, body.reportId), eq(anticheatReport.sessionId, body.sessionId)),
        )
    : [];
  await db.insert(anticheatActionTaken).values({
    userId: session.userId,
    sessionId: body.sessionId,
    reportId: report?.id ?? null,
    action: body.action,
    reason: body.reason,
    sha512: body.sha512,
  });
}

export const anticheatTrustService = { serverEvents, adjust, setHold, recordAction };
