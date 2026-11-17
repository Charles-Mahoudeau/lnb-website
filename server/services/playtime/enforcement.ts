import { and, eq, gt, isNull } from 'drizzle-orm';

import { playtimeNotice, wardenSession } from '~~/server/db/schema';
import { wardenAuditService } from '~~/server/services/warden/audit';

import { playtimeContextService } from './context';
import { dueNotices, weekStart } from './rules';
import type { Tx } from './shared';
import { playtimeStateService, toBlock } from './state';
import type { AccountState } from './state';

// What the five-second timer tells the Minecraft server about the players online: warnings, the
// grace period, changes of state and the kick. Only in `enforce`. Everything is an audit row, which
// the events stream sends within a second (see server/services/warden/events.ts). See
// docs/playtime.md.

/**
 * What the server was last told about each open session, to send an update only when the state
 * changes. Kept in memory: after a restart the first look at a session is silent, and the heartbeat
 * answer covers anything that changed meanwhile.
 */
const lastSeen = new Map<string, string>();

function signature({ evaluation, playtime }: AccountState): string {
  return JSON.stringify([
    playtime.limited,
    evaluation.state,
    playtime.windowEndsAt,
    playtime.graceEndsAt,
    playtime.limitSeconds,
  ]);
}

/**
 * Keeps each notice to once: true when at least one of the kinds is new for this session. The
 * kinds carry the week, so a session that spans a reset can be warned again.
 */
async function claim(tx: Tx, sessionId: string, kinds: string[]): Promise<boolean> {
  const rows = await tx
    .insert(playtimeNotice)
    .values(kinds.map((kind) => ({ sessionId, kind })))
    .onConflictDoNothing()
    .returning({ kind: playtimeNotice.kind });
  return rows.length > 0;
}

/**
 * Warns, tells about grace, sends changes and kicks for one player's open sessions, in the
 * transaction that just counted their time. Safe to run twice: each notice is claimed first.
 */
async function enforceUser(
  tx: Tx,
  userId: string,
  now: number,
  heartbeatAfter: Date,
): Promise<string[]> {
  const sessions = await tx
    .select({ id: wardenSession.id, uuid: wardenSession.minecraftUuid })
    .from(wardenSession)
    .where(
      and(
        eq(wardenSession.userId, userId),
        isNull(wardenSession.endedAt),
        gt(wardenSession.lastHeartbeatAt, heartbeatAfter),
      ),
    );
  if (sessions.length === 0) return [];
  const context = await playtimeContextService.load(tx, userId, now);
  if (!context) return [];
  const states = await playtimeStateService.forAccounts(
    tx,
    userId,
    sessions.map((session) => session.uuid),
    now,
    'enforce',
    context,
  );
  const week = weekStart(now);
  const record = (
    action: 'playtime.warning' | 'playtime.grace' | 'playtime.update' | 'playtime.kick',
    uuid: string,
    data: Record<string, unknown>,
  ) =>
    wardenAuditService.record(tx, {
      action,
      actor: { source: 'system' },
      targetUserId: userId,
      targetMinecraftUuid: uuid,
      data: { uuids: [uuid], ...data },
    });

  for (const session of sessions) {
    const state = states.get(session.uuid);
    if (!state) continue;
    const before = lastSeen.get(session.id);
    const current = signature(state);
    lastSeen.set(session.id, current);
    const due = dueNotices(state.evaluation, context.config, now);

    if (due.kick) {
      if (await claim(tx, session.id, [`${week}:kick`])) {
        await record('playtime.kick', session.uuid, {
          reason: 'playtimeLimit',
          playtime: toBlock(state.evaluation),
        });
      }
      continue;
    }
    if (due.grace) {
      if (await claim(tx, session.id, [`${week}:grace`])) {
        await record('playtime.grace', session.uuid, { graceEndsAt: state.playtime.graceEndsAt });
        continue;
      }
    }
    if (
      due.warning &&
      (await claim(
        tx,
        session.id,
        due.warning.notices.map((n) => `${week}:${n}`),
      ))
    ) {
      await record('playtime.warning', session.uuid, {
        remainingSeconds: due.warning.remainingSeconds,
        kind: due.warning.kind,
      });
    }
    if (before !== undefined && before !== current) {
      await record('playtime.update', session.uuid, { playtime: state.playtime });
    }
  }
  return sessions.map((session) => session.id);
}

/** Forgets the sessions that are no longer online, or everything when nothing is enforced. */
function forgetExcept(open: ReadonlySet<string>) {
  for (const id of lastSeen.keys()) if (!open.has(id)) lastSeen.delete(id);
}

export const playtimeEnforcementService = { enforceUser, forgetExcept };
