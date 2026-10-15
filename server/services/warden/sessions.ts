import { and, eq, gt, inArray, isNull, lt, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  minecraftAccount,
  minecraftUsername,
  wardenNote,
  wardenSession,
} from '~~/server/db/schema';
import type { WardenSessionEndReason } from '~~/server/db/schema';
import { uuidMatchesAccount } from '~~/server/lib/minecraft';

import { wardenLinkService } from './links';
import { wardenModerationService } from './moderation';
import { wardenPlayerService } from './players';
import { SESSION_TIMEOUT_MS, shortName } from './rules';
import { wardenSettingsService } from './settings';
import { refuse } from './shared';
import type { Tx } from './shared';

import type { WardenLogin, WardenLoginBody } from '#shared/schemas/warden';
import { canLinkFromSchool, getLinkApp } from '#shared/utils/link-apps';
import { isWardenAdmin, WARDEN_ADMIN_ROLE } from '#shared/utils/roles';
import { schoolForTenant } from '#shared/utils/schools';

/**
 * Decides whether a player may join, for the Minecraft server. Opens a session when they may.
 * An account that isn't linked gets a link code, bound to the player when the token is theirs.
 */
async function login(body: WardenLoginBody): Promise<WardenLogin> {
  if (!uuidMatchesAccount(body)) refuse(400, 'invalidUuid');
  return db.transaction(async (tx) => {
    const settings = await wardenSettingsService.get(tx);
    const player = await wardenPlayerService.findByToken(body.token, tx);
    const [account] = await tx
      .select()
      .from(minecraftAccount)
      .where(eq(minecraftAccount.uuid, body.uuid));

    if (!account) {
      if (body.cracked && !settings.allowCracked) return denied('crackedNotAllowed');
      const ban = player && (await wardenModerationService.activeBan(player.userId, tx));
      if (ban) return denied('banned', ban);
      const link = await wardenLinkService.create(
        { uuid: body.uuid, username: body.username, cracked: body.cracked, token: body.token },
        tx,
      );
      return { ...denied('notLinked'), link };
    }

    if (!player) return denied('unknownToken');
    if (account.userId !== player.userId) return denied('linkedElsewhere');
    if (account.cracked !== body.cracked) return denied('crackedMismatch');
    if (account.cracked && !settings.allowCracked) return denied('crackedNotAllowed');
    const app = getLinkApp('warden');
    if (app && !canLinkFromSchool(app, player.tenantId)) return denied('schoolNotAllowed');
    const ban = await wardenModerationService.activeBan(player.userId, tx);
    if (ban) return denied('banned', ban);

    const now = new Date();
    if (account.username !== body.username) {
      await tx
        .update(minecraftAccount)
        .set({ username: body.username })
        .where(eq(minecraftAccount.uuid, account.uuid));
      await tx
        .insert(minecraftUsername)
        .values({ minecraftUuid: account.uuid, username: body.username })
        .onConflictDoNothing();
    }
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
      .values({ minecraftUuid: account.uuid, userId: player.userId })
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
      player: {
        userId: player.userId,
        displayName: player.showRealName ? shortName(player.name) : null,
        school: schoolForTenant(player.tenantId) ?? null,
        roles: isWardenAdmin(player.role) ? [WARDEN_ADMIN_ROLE] : [],
      },
      account: { uuid: account.uuid, username: body.username },
      warnings: warnings.map((w) => ({ ...w, createdAt: w.createdAt.toISOString() })),
    } satisfies WardenLogin;
  });
}

function denied(
  reason: Exclude<WardenLogin, { result: 'allowed' }>['reason'],
  ban?: { reason: string; expiresAt: Date | null },
): Exclude<WardenLogin, { result: 'allowed' }> {
  return {
    result: 'denied',
    reason,
    ...(ban && { ban: { reason: ban.reason, expiresAt: ban.expiresAt?.toISOString() ?? null } }),
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
