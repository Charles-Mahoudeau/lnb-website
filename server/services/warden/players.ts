import { and, asc, count, desc, eq, inArray, isNull, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  minecraftAccount,
  minecraftUsername,
  user,
  wardenAppeal,
  wardenBan,
  wardenNote,
  wardenPlayer,
  wardenSession,
} from '~~/server/db/schema';

import { wardenAuditService } from './audit';
import { wardenModerationService } from './moderation';
import { isBanActive, isOnline, resolveMaxAccounts, shortName } from './rules';
import { wardenSettingsService } from './settings';
import { refuse } from './shared';
import type { Db, WardenActor } from './shared';
import { appealView } from './views';

import type {
  WardenAccountView,
  WardenHistoryItem,
  WardenMe,
  WardenPage,
  WardenServerPlayer,
  WardenSessionView,
} from '#shared/schemas/warden';
import { canLinkFromSchool, getLinkApp } from '#shared/utils/link-apps';
import { isWardenAdmin, WARDEN_ADMIN_ROLE } from '#shared/utils/roles';
import { schoolForTenant } from '#shared/utils/schools';

/** The player's Warden row, created on first need. */
async function ensure(dbx: Db, userId: string) {
  await dbx
    .insert(wardenPlayer)
    .values({ userId })
    .onConflictDoNothing({ target: wardenPlayer.userId });
  const [row] = await dbx.select().from(wardenPlayer).where(eq(wardenPlayer.userId, userId));
  return row!;
}

/** How many accounts the player has linked, and may link. */
async function limit(dbx: Db, userId: string): Promise<{ used: number; max: number }> {
  const [player] = await dbx
    .select({ maxAccounts: wardenPlayer.maxAccounts })
    .from(wardenPlayer)
    .where(eq(wardenPlayer.userId, userId));
  const [linked] = await dbx
    .select({ used: count() })
    .from(minecraftAccount)
    .where(eq(minecraftAccount.userId, userId));
  const settings = await wardenSettingsService.get(dbx);
  return {
    used: linked?.used ?? 0,
    max: resolveMaxAccounts(player?.maxAccounts, settings.defaultMaxAccounts),
  };
}

/** The player's linked accounts, with past usernames and online state. */
async function accounts(dbx: Db, userId: string): Promise<WardenAccountView[]> {
  const rows = await dbx
    .select()
    .from(minecraftAccount)
    .where(eq(minecraftAccount.userId, userId))
    .orderBy(asc(minecraftAccount.linkedAt));
  if (rows.length === 0) return [];
  const uuids = rows.map((row) => row.uuid);
  const names = await dbx
    .select()
    .from(minecraftUsername)
    .where(inArray(minecraftUsername.minecraftUuid, uuids))
    .orderBy(desc(minecraftUsername.firstSeenAt));
  const open = await dbx
    .select({
      minecraftUuid: wardenSession.minecraftUuid,
      endedAt: wardenSession.endedAt,
      lastHeartbeatAt: wardenSession.lastHeartbeatAt,
    })
    .from(wardenSession)
    .where(and(inArray(wardenSession.minecraftUuid, uuids), isNull(wardenSession.endedAt)));
  const now = Date.now();
  return rows.map((row) => ({
    uuid: row.uuid,
    username: row.username,
    linkedAt: row.linkedAt.toISOString(),
    lastSeenAt: row.lastSeenAt?.toISOString() ?? null,
    online: open.some((s) => s.minecraftUuid === row.uuid && isOnline(s, now)),
    playtimeSeconds: row.playtimeSeconds,
    pastUsernames: names
      .filter((n) => n.minecraftUuid === row.uuid && n.username !== row.username)
      .map((n) => ({ username: n.username, firstSeenAt: n.firstSeenAt.toISOString() })),
  }));
}

/** The past bans and the warnings a player sees on /warden, newest first. */
async function history(dbx: Db, userId: string): Promise<WardenHistoryItem[]> {
  const bans = await dbx
    .select()
    .from(wardenBan)
    .where(eq(wardenBan.userId, userId))
    .orderBy(desc(wardenBan.createdAt));
  const warnings = await dbx
    .select()
    .from(wardenNote)
    .where(and(eq(wardenNote.userId, userId), eq(wardenNote.kind, 'warning')))
    .orderBy(desc(wardenNote.createdAt));
  const now = new Date();
  const items: WardenHistoryItem[] = [
    ...bans.map((ban) => ({
      kind: 'ban' as const,
      id: ban.id,
      reason: ban.reason,
      createdAt: ban.createdAt.toISOString(),
      expiresAt: ban.expiresAt?.toISOString() ?? null,
      revokedAt: ban.revokedAt?.toISOString() ?? null,
      active: isBanActive(ban, now),
    })),
    ...warnings.map((note) => ({
      kind: 'warning' as const,
      id: note.id,
      body: note.body,
      createdAt: note.createdAt.toISOString(),
    })),
  ];
  return items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

/** Refuses students of schools Warden isn't open to. */
export function requireWardenSchool(tenantId: string): void {
  const app = getLinkApp('warden');
  if (!app || !canLinkFromSchool(app, tenantId)) refuse(403, 'schoolNotAllowed');
}

/** Everything the /minecraft/warden page shows. */
async function me(actor: { id: string; name: string; tenantId: string }): Promise<WardenMe> {
  requireWardenSchool(actor.tenantId);
  return db.transaction(async (tx) => {
    const player = await ensure(tx, actor.id);
    const list = await accounts(tx, actor.id);
    const ban = await wardenModerationService.activeBan(actor.id, tx);
    const [appeal] = ban
      ? await tx.select().from(wardenAppeal).where(eq(wardenAppeal.banId, ban.id))
      : [];
    const lastSeen = list
      .map((a) => a.lastSeenAt)
      .filter((at): at is string => at !== null)
      .sort()
      .at(-1);
    return {
      showRealName: player.showRealName,
      shortName: shortName(actor.name),
      limit: await limit(tx, actor.id),
      accounts: list,
      totals: {
        playtimeSeconds: list.reduce((sum, a) => sum + a.playtimeSeconds, 0),
        lastSeenAt: lastSeen ?? null,
      },
      activeBan: ban
        ? {
            id: ban.id,
            reason: ban.reason,
            createdAt: ban.createdAt.toISOString(),
            expiresAt: ban.expiresAt?.toISOString() ?? null,
            appeal: appeal ? appealView(appeal, new Map()) : null,
          }
        : null,
      history: await history(tx, actor.id),
      sessions: await sessions(actor.id),
    };
  });
}

/** Shows or hides the player's name in-game. */
async function setShowRealName(actor: { id: string; tenantId: string }, showRealName: boolean) {
  requireWardenSchool(actor.tenantId);
  await db.transaction(async (tx) => {
    await ensure(tx, actor.id);
    await tx.update(wardenPlayer).set({ showRealName }).where(eq(wardenPlayer.userId, actor.id));
    await wardenAuditService.record(tx, {
      action: 'identity.update',
      actor: { source: 'web', userId: actor.id },
      targetUserId: actor.id,
      data: { showRealName },
    });
  });
}

/** Unlinks a Minecraft account. Its sessions and username history go with it. */
async function unlink(input: { userId: string; uuid: string; actor: WardenActor }) {
  return db.transaction(async (tx) => {
    const [removed] = await tx
      .delete(minecraftAccount)
      .where(and(eq(minecraftAccount.uuid, input.uuid), eq(minecraftAccount.userId, input.userId)))
      .returning({ username: minecraftAccount.username });
    if (!removed) refuse(404, 'notLinked');
    const auditId = await wardenAuditService.record(tx, {
      action: 'unlink',
      actor: input.actor,
      targetUserId: input.userId,
      targetMinecraftUuid: input.uuid,
      data: { username: removed.username },
    });
    return { auditId };
  });
}

/** The player's sessions, newest first, 20 per page. */
async function sessions(userId: string, cursor?: string): Promise<WardenPage<WardenSessionView>> {
  const after = decodeCursor(cursor);
  const pageSize = 20;
  const rows = await db
    .select({ session: wardenSession, username: minecraftAccount.username })
    .from(wardenSession)
    .innerJoin(minecraftAccount, eq(minecraftAccount.uuid, wardenSession.minecraftUuid))
    .where(
      and(
        eq(wardenSession.userId, userId),
        after
          ? sql`(${wardenSession.startedAt}, ${wardenSession.id}) < (${after.at}::timestamp, ${after.id}::uuid)`
          : undefined,
      ),
    )
    .orderBy(desc(wardenSession.startedAt), desc(wardenSession.id))
    .limit(pageSize + 1);
  const now = Date.now();
  const items = rows.slice(0, pageSize).map(({ session, username }) => {
    // A session the server stopped reporting ends at its last heartbeat, like closeStale does.
    const online = isOnline(session, now);
    const end = session.endedAt?.getTime() ?? (online ? now : session.lastHeartbeatAt.getTime());
    return {
      id: session.id,
      minecraftUuid: session.minecraftUuid,
      username,
      startedAt: session.startedAt.toISOString(),
      endedAt: session.endedAt?.toISOString() ?? null,
      durationSeconds: Math.max(0, Math.round((end - session.startedAt.getTime()) / 1000)),
      online,
    };
  });
  const last = items.at(-1);
  return {
    items,
    nextCursor:
      rows.length > pageSize && last ? encodeCursor({ at: last.startedAt, id: last.id }) : null,
  };
}

export function encodeCursor(value: { at: string; id: string }): string {
  return Buffer.from(`${value.at}|${value.id}`).toString('base64url');
}

export function decodeCursor(cursor: string | undefined): { at: string; id: string } | undefined {
  if (!cursor) return undefined;
  const [at, id] = Buffer.from(cursor, 'base64url').toString().split('|');
  if (!at || !id || Number.isNaN(Date.parse(at)) || !/^[\da-f-]{36}$/.test(id)) {
    refuse(400, 'invalidCursor');
  }
  return { at, id };
}

/** A player by one of their Minecraft accounts, for staff commands in-game. */
async function lookup(uuid: string): Promise<WardenServerPlayer> {
  const [owner] = await db
    .select({ userId: user.id, name: user.name, tenantId: user.tenantId, role: user.role })
    .from(minecraftAccount)
    .innerJoin(user, eq(user.id, minecraftAccount.userId))
    .where(eq(minecraftAccount.uuid, uuid));
  if (!owner) refuse(404, 'notLinked');
  const list = await accounts(db, owner.userId);
  const ban = await wardenModerationService.activeBan(owner.userId);
  const [warnings] = await db
    .select({ count: count() })
    .from(wardenNote)
    .where(and(eq(wardenNote.userId, owner.userId), eq(wardenNote.kind, 'warning')));
  return {
    userId: owner.userId,
    name: owner.name,
    school: schoolForTenant(owner.tenantId) ?? null,
    roles: isWardenAdmin(owner.role) ? [WARDEN_ADMIN_ROLE] : [],
    accounts: list.map(({ uuid, username }) => ({ uuid, username })),
    activeBan: ban
      ? { id: ban.id, reason: ban.reason, expiresAt: ban.expiresAt?.toISOString() ?? null }
      : null,
    warnings: warnings?.count ?? 0,
    playtimeSeconds: list.reduce((sum, a) => sum + a.playtimeSeconds, 0),
  };
}

export const wardenPlayerService = {
  lookup,
  ensure,
  limit,
  accounts,
  history,
  me,
  setShowRealName,
  unlink,
  sessions,
};
