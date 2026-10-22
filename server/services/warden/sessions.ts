import { and, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  minecraftAccount,
  minecraftUsername,
  user,
  wardenDevice,
  wardenJoinTicket,
  wardenNote,
  wardenPlayer,
  wardenSession,
} from '~~/server/db/schema';
import type { WardenSessionEndReason } from '~~/server/db/schema';
import { uuidMatchesUsername } from '~~/server/lib/minecraft';

import { wardenAuditService } from './audit';
import { wardenModerationService } from './moderation';
import { wardenPlayerService } from './players';
import { hashSecret, SESSION_TIMEOUT_MS, shortName } from './rules';
import { refuse } from './shared';
import type { Tx } from './shared';

import type { WardenLogin, WardenLoginBody } from '#shared/schemas/warden';
import { canLinkFromSchool, getLinkApp } from '#shared/utils/link-apps';
import { isWardenAdmin, WARDEN_ADMIN_ROLE } from '#shared/utils/roles';

/**
 * Decides whether a player may join, for the Minecraft server. The ticket comes from the player's
 * mod and proves which LNB account is joining as `username`. It is used up by the attempt, whatever
 * the outcome. Opens a session when the player may join, and links the account first when the
 * ticket says the player agreed to.
 */
async function login(body: WardenLoginBody): Promise<WardenLogin> {
  if (!uuidMatchesUsername(body)) refuse(400, 'invalidUuid');
  // Denials are returned, not thrown, so the used ticket is saved with the transaction.
  return db.transaction(async (tx) => {
    const ticket = await useTicket(tx, body);
    if (!ticket) return denied('invalidTicket');

    const [player] = await tx
      .select({
        userId: user.id,
        name: user.name,
        tenantId: user.tenantId,
        role: user.role,
        showRealName: wardenPlayer.showRealName,
      })
      .from(user)
      .leftJoin(wardenPlayer, eq(wardenPlayer.userId, user.id))
      .where(eq(user.id, ticket.userId));
    if (!player) return denied('invalidTicket');

    const app = getLinkApp('warden');
    if (app && !canLinkFromSchool(app, player.tenantId)) return denied('schoolNotAllowed');
    // Before linking, so a banned player can't use up a slot.
    const ban = await wardenModerationService.activeBan(player.userId, tx);
    if (ban) return denied('banned', { ban });

    let [account] = await tx
      .select()
      .from(minecraftAccount)
      .where(eq(minecraftAccount.uuid, body.uuid));
    if (account && account.userId !== player.userId) return denied('linkedElsewhere');

    let linked = false;
    if (!account) {
      if (!ticket.link) {
        return denied('notLinked', { limit: await wardenPlayerService.limit(tx, player.userId) });
      }
      const result = await linkAccount(tx, { userId: player.userId, body });
      if (result.problem) return denied(result.problem, { limit: result.limit });
      account = result.account;
      linked = true;
    }

    const now = new Date();
    // A new login ends any session the server didn't close, such as after a crash.
    await closeSessions(tx, {
      where: and(eq(wardenSession.minecraftUuid, account.uuid), isNull(wardenSession.endedAt)),
      reason: 'timeout',
      at: 'lastHeartbeat',
    });
    await tx
      .update(minecraftAccount)
      .set({ lastSeenAt: now })
      .where(eq(minecraftAccount.uuid, account.uuid));
    const [session] = await tx
      .insert(wardenSession)
      .values({ minecraftUuid: account.uuid, userId: player.userId, deviceId: ticket.deviceId })
      .returning({ id: wardenSession.id });

    // Warnings since the account was last seen, so the server can show them once.
    const warnings = await tx
      .select({ id: wardenNote.id, body: wardenNote.body, createdAt: wardenNote.createdAt })
      .from(wardenNote)
      .where(
        and(
          eq(wardenNote.userId, player.userId),
          eq(wardenNote.kind, 'warning'),
          account.lastSeenAt ? gt(wardenNote.createdAt, account.lastSeenAt) : undefined,
        ),
      );

    return {
      result: 'allowed',
      sessionId: session!.id,
      linked,
      player: {
        userId: player.userId,
        displayName: (player.showRealName ?? true) ? shortName(player.name) : null,
        roles: isWardenAdmin(player.role) ? [WARDEN_ADMIN_ROLE] : [],
      },
      account: { uuid: account.uuid, username: body.username },
      warnings: warnings.map((w) => ({ ...w, createdAt: w.createdAt.toISOString() })),
    } satisfies WardenLogin;
  });
}

/**
 * Uses up the ticket, whatever the outcome, and returns it when it was valid for this login: known,
 * unused, unexpired, for the same nonce and username, and from a device that is still active.
 */
async function useTicket(tx: Tx, body: WardenLoginBody) {
  const [ticket] = await tx
    .update(wardenJoinTicket)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(wardenJoinTicket.ticketHash, hashSecret(body.ticket)),
        isNull(wardenJoinTicket.usedAt),
      ),
    )
    .returning();
  if (!ticket) return undefined;
  if (ticket.expiresAt <= new Date()) return undefined;
  if (ticket.nonce !== body.nonce || ticket.username !== body.username) return undefined;
  const [device] = await tx
    .select({ id: wardenDevice.id })
    .from(wardenDevice)
    .where(
      and(
        eq(wardenDevice.id, ticket.deviceId),
        isNull(wardenDevice.revokedAt),
        gt(wardenDevice.expiresAt, new Date()),
      ),
    );
  return device ? ticket : undefined;
}

/** Links the account to the player, unless the player is at their limit. */
async function linkAccount(tx: Tx, input: { userId: string; body: WardenLoginBody }) {
  // Lock the player row, so two logins at once can't both pass the limit.
  await wardenPlayerService.ensure(tx, input.userId);
  await tx
    .select({ userId: wardenPlayer.userId })
    .from(wardenPlayer)
    .where(eq(wardenPlayer.userId, input.userId))
    .for('update');

  const limit = await wardenPlayerService.limit(tx, input.userId);
  if (limit.used >= limit.max) {
    return { problem: 'accountLimitReached' as const, limit, account: undefined };
  }
  const [account] = await tx
    .insert(minecraftAccount)
    .values({ uuid: input.body.uuid, userId: input.userId, username: input.body.username })
    .onConflictDoNothing()
    .returning();
  // Taken by someone else between the login's check and now.
  if (!account)
    return { problem: 'linkedElsewhere' as const, limit: undefined, account: undefined };
  await tx
    .insert(minecraftUsername)
    .values({ minecraftUuid: account.uuid, username: input.body.username });
  await wardenAuditService.record(tx, {
    action: 'link',
    actor: {
      source: 'minecraft',
      userId: input.userId,
      minecraft: { uuid: account.uuid, username: account.username },
    },
    targetUserId: input.userId,
    targetMinecraftUuid: account.uuid,
    data: { username: account.username },
  });
  return { problem: undefined, limit: undefined, account };
}

function denied(
  reason: Exclude<WardenLogin, { result: 'allowed' }>['reason'],
  extra: {
    ban?: { reason: string; expiresAt: Date | null };
    limit?: { used: number; max: number };
  } = {},
): Exclude<WardenLogin, { result: 'allowed' }> {
  const { ban, limit } = extra;
  return {
    result: 'denied',
    reason,
    ...(ban && { ban: { reason: ban.reason, expiresAt: ban.expiresAt?.toISOString() ?? null } }),
    ...(limit && { limit }),
  };
}

/** Keeps open sessions alive. Returns the IDs the site no longer knows as open. */
async function heartbeat(sessionIds: string[]): Promise<{ unknown: string[] }> {
  if (sessionIds.length === 0) return { unknown: [] };
  const now = new Date();
  const alive = await db
    .update(wardenSession)
    .set({ lastHeartbeatAt: now })
    .where(and(inArray(wardenSession.id, sessionIds), isNull(wardenSession.endedAt)))
    .returning({ id: wardenSession.id, minecraftUuid: wardenSession.minecraftUuid });
  if (alive.length) {
    await db
      .update(minecraftAccount)
      .set({ lastSeenAt: now })
      .where(
        inArray(
          minecraftAccount.uuid,
          alive.map((s) => s.minecraftUuid),
        ),
      );
  }
  const known = new Set(alive.map((s) => s.id));
  return { unknown: sessionIds.filter((id) => !known.has(id)) };
}

/** Closes a session when the player leaves. Closing it twice does nothing. */
async function end(input: { sessionId: string; reason: WardenSessionEndReason }) {
  await db.transaction((tx) =>
    closeSessions(tx, {
      where: and(eq(wardenSession.id, input.sessionId), isNull(wardenSession.endedAt)),
      reason: input.reason,
      at: 'now',
    }),
  );
}

/** Closes sessions whose server stopped sending heartbeats. Run every few minutes. */
async function closeStale(): Promise<number> {
  const before = new Date(Date.now() - SESSION_TIMEOUT_MS);
  return db.transaction((tx) =>
    closeSessions(tx, {
      where: and(isNull(wardenSession.endedAt), lt(wardenSession.lastHeartbeatAt, before)),
      reason: 'timeout',
      at: 'lastHeartbeat',
    }),
  );
}

/** Ends the matching sessions and adds their length to each account's playtime. */
async function closeSessions(
  tx: Tx,
  input: {
    where: ReturnType<typeof and>;
    reason: WardenSessionEndReason;
    at: 'now' | 'lastHeartbeat';
  },
): Promise<number> {
  const endedAt = input.at === 'now' ? sql`now()` : sql`${wardenSession.lastHeartbeatAt}`;
  const closed = await tx
    .update(wardenSession)
    .set({ endedAt, endReason: input.reason })
    .where(input.where)
    .returning({
      minecraftUuid: wardenSession.minecraftUuid,
      endedAt: wardenSession.endedAt,
      seconds:
        sql<number>`greatest(0, extract(epoch from (${wardenSession.endedAt} - ${wardenSession.startedAt})))::bigint`.mapWith(
          Number,
        ),
    });
  for (const session of closed) {
    await tx
      .update(minecraftAccount)
      .set({
        playtimeSeconds: sql`${minecraftAccount.playtimeSeconds} + ${session.seconds}`,
        // Postgres's greatest() skips nulls. The date goes in as an ISO string: node-postgres
        // writes raw Date parameters in local time, and the columns hold UTC.
        lastSeenAt: sql`greatest(${minecraftAccount.lastSeenAt}, ${session.endedAt!.toISOString()}::timestamp)`,
      })
      .where(eq(minecraftAccount.uuid, session.minecraftUuid));
  }
  return closed.length;
}

export const wardenSessionService = { login, heartbeat, end, closeStale };
