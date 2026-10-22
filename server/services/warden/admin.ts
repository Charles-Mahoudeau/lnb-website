import { and, asc, desc, eq, exists, gt, ilike, inArray, isNull, lt, or, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  minecraftAccount,
  user,
  wardenAppeal,
  wardenAudit,
  wardenBan,
  wardenNote,
  wardenPlayer,
  wardenSession,
  wardenSettings,
} from '~~/server/db/schema';
import type { WardenAuditAction, WardenSource } from '~~/server/db/schema';

import { wardenAuditService } from './audit';
import { wardenPlayerService } from './players';
import { isBanActive, isOnline, SESSION_TIMEOUT_MS } from './rules';
import { wardenSettingsService } from './settings';
import { refuse } from './shared';
import type { Db, WardenActor } from './shared';
import { actorView, appealView, banNameIds, banView, namesOf, noteView } from './views';

import type {
  WardenAuditView,
  WardenPage,
  WardenPlayerDetail,
  WardenPlayerRow,
  WardenSettingsView,
  WardenUserOption,
} from '#shared/schemas/warden';
import { canLinkFromSchool, getLinkApp } from '#shared/utils/link-apps';
import { isAdmin, isWardenAdmin, WARDEN_ADMIN_ROLE, withRole } from '#shared/utils/roles';
import { schoolForTenant } from '#shared/utils/schools';

const PAGE_SIZE = 50;

function activeBanWhere() {
  return and(
    eq(wardenBan.userId, wardenPlayer.userId),
    isNull(wardenBan.revokedAt),
    or(isNull(wardenBan.expiresAt), gt(wardenBan.expiresAt, new Date())),
  );
}

/** Players for the admin panel, by name, 50 per page. */
async function players(query: {
  q?: string;
  status: 'all' | 'banned' | 'online';
  cursor?: string;
}): Promise<WardenPage<WardenPlayerRow>> {
  const after = query.cursor ? decodeNameCursor(query.cursor) : undefined;
  const search = query.q ? `%${query.q.replace(/[\\%_]/g, '\\$&')}%` : undefined;
  const onlineSince = new Date(Date.now() - SESSION_TIMEOUT_MS).toISOString();

  const rows = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      tenantId: user.tenantId,
      role: user.role,
    })
    .from(wardenPlayer)
    .innerJoin(user, eq(user.id, wardenPlayer.userId))
    .where(
      and(
        search
          ? or(
              ilike(user.name, search),
              ilike(user.email, search),
              exists(
                db
                  .select({ one: sql`1` })
                  .from(minecraftAccount)
                  .where(
                    and(
                      eq(minecraftAccount.userId, wardenPlayer.userId),
                      ilike(minecraftAccount.username, search),
                    ),
                  ),
              ),
            )
          : undefined,
        query.status === 'banned'
          ? exists(
              db
                .select({ one: sql`1` })
                .from(wardenBan)
                .where(activeBanWhere()),
            )
          : undefined,
        query.status === 'online'
          ? exists(
              db
                .select({ one: sql`1` })
                .from(wardenSession)
                .where(
                  and(
                    eq(wardenSession.userId, wardenPlayer.userId),
                    isNull(wardenSession.endedAt),
                    sql`${wardenSession.lastHeartbeatAt} > ${onlineSince}::timestamp`,
                  ),
                ),
            )
          : undefined,
        after ? sql`(${user.name}, ${user.id}) > (${after.name}, ${after.id})` : undefined,
      ),
    )
    .orderBy(asc(user.name), asc(user.id))
    .limit(PAGE_SIZE + 1);

  const page = rows.slice(0, PAGE_SIZE);
  const ids = page.map((row) => row.userId);
  const accounts = ids.length
    ? await db.select().from(minecraftAccount).where(inArray(minecraftAccount.userId, ids))
    : [];
  const sessions = ids.length
    ? await db
        .select({
          minecraftUuid: wardenSession.minecraftUuid,
          endedAt: wardenSession.endedAt,
          lastHeartbeatAt: wardenSession.lastHeartbeatAt,
        })
        .from(wardenSession)
        .where(and(inArray(wardenSession.userId, ids), isNull(wardenSession.endedAt)))
    : [];
  const bans = ids.length
    ? await db
        .select()
        .from(wardenBan)
        .where(and(inArray(wardenBan.userId, ids), isNull(wardenBan.revokedAt)))
    : [];

  const now = new Date();
  const items = page.map((row): WardenPlayerRow => {
    const own = accounts.filter((a) => a.userId === row.userId);
    const ban = bans.find((b) => b.userId === row.userId && isBanActive(b, now));
    const lastSeen = own
      .map((a) => a.lastSeenAt)
      .filter((at): at is Date => at !== null)
      .sort((a, b) => a.getTime() - b.getTime())
      .at(-1);
    return {
      userId: row.userId,
      name: row.name,
      email: row.email,
      school: schoolForTenant(row.tenantId) ?? null,
      wardenAdmin: isWardenAdmin(row.role),
      accounts: own.map((a) => ({
        uuid: a.uuid,
        username: a.username,
        cracked: a.cracked,
        online: sessions.some((s) => s.minecraftUuid === a.uuid && isOnline(s, now.getTime())),
      })),
      ban: ban ? { id: ban.id, expiresAt: ban.expiresAt?.toISOString() ?? null } : null,
      lastSeenAt: lastSeen?.toISOString() ?? null,
      playtimeSeconds: own.reduce((sum, a) => sum + a.playtimeSeconds, 0),
    };
  });
  const last = page.at(-1);
  return {
    items,
    nextCursor:
      rows.length > PAGE_SIZE && last
        ? Buffer.from(JSON.stringify([last.name, last.userId])).toString('base64url')
        : null,
  };
}

function decodeNameCursor(cursor: string): { name: string; id: string } {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (Array.isArray(value) && typeof value[0] === 'string' && typeof value[1] === 'string') {
      return { name: value[0], id: value[1] };
    }
  } catch {
    // Falls through to the refusal.
  }
  refuse(400, 'invalidCursor');
}

/** Everything about one player, for their admin page. */
async function player(userId: string): Promise<WardenPlayerDetail> {
  const [row] = await db
    .select({ user, warden: wardenPlayer })
    .from(user)
    .leftJoin(wardenPlayer, eq(wardenPlayer.userId, user.id))
    .where(eq(user.id, userId));
  if (!row) refuse(404, 'notFound');

  const bans = await db
    .select()
    .from(wardenBan)
    .where(eq(wardenBan.userId, userId))
    .orderBy(desc(wardenBan.createdAt));
  const appeals = bans.length
    ? await db
        .select()
        .from(wardenAppeal)
        .where(
          inArray(
            wardenAppeal.banId,
            bans.map((b) => b.id),
          ),
        )
    : [];
  const notes = await db
    .select()
    .from(wardenNote)
    .where(eq(wardenNote.userId, userId))
    .orderBy(desc(wardenNote.createdAt));
  const audit = await auditEntries({ userId, limit: 50 });
  const names = await namesOf(db, [
    ...bans.flatMap(banNameIds),
    ...appeals.map((a) => a.decidedByUserId),
    ...notes.map((n) => n.authorUserId),
  ]);

  return {
    player: {
      userId,
      name: row.user.name,
      email: row.user.email,
      school: schoolForTenant(row.user.tenantId) ?? null,
      admin: isAdmin(row.user.role),
      wardenAdmin: isWardenAdmin(row.user.role),
      showRealName: row.warden?.showRealName ?? false,
      tokenRotatedAt: row.warden?.tokenRotatedAt.toISOString() ?? null,
      maxAccounts: row.warden?.maxAccounts ?? null,
      defaultMaxAccounts: (await wardenSettingsService.get()).defaultMaxAccounts,
      limit: await wardenPlayerService.limit(db, userId),
    },
    accounts: await wardenPlayerService.accounts(db, userId),
    bans: bans.map((ban) => {
      const appeal = appeals.find((a) => a.banId === ban.id);
      return { ...banView(ban, names), appeal: appeal ? appealView(appeal, names) : null };
    }),
    notes: notes.map((note) => noteView(note, names)),
    sessions: await wardenPlayerService.sessions(userId),
    audit: audit.items,
  };
}

/** Sets or clears a player's own account limit. */
async function setMaxAccounts(input: {
  userId: string;
  maxAccounts: number | null;
  actor: WardenActor;
}) {
  await db.transaction(async (tx) => {
    await requireUser(tx, input.userId);
    await wardenPlayerService.ensure(tx, input.userId);
    await tx
      .update(wardenPlayer)
      .set({ maxAccounts: input.maxAccounts })
      .where(eq(wardenPlayer.userId, input.userId));
    await wardenAuditService.record(tx, {
      action: 'limit.set',
      actor: input.actor,
      targetUserId: input.userId,
      data: { maxAccounts: input.maxAccounts },
    });
  });
}

/** Gives or removes the warden-admin role. Site admins only. */
async function setWardenAdmin(input: { userId: string; on: boolean; actor: WardenActor }) {
  await db.transaction(async (tx) => {
    const target = await requireUser(tx, input.userId);
    await tx
      .update(user)
      .set({ role: withRole(target.role, WARDEN_ADMIN_ROLE, input.on) })
      .where(eq(user.id, input.userId));
    await wardenAuditService.record(tx, {
      action: 'role.set',
      actor: input.actor,
      targetUserId: input.userId,
      data: { role: WARDEN_ADMIN_ROLE, on: input.on },
    });
  });
}

async function requireUser(dbx: Db, userId: string) {
  const [row] = await dbx.select({ role: user.role }).from(user).where(eq(user.id, userId));
  if (!row) refuse(404, 'notFound');
  return row;
}

/** The audit log, newest first. `cursor` is the last ID of the previous page. */
async function auditEntries(query: {
  userId?: string;
  action?: string;
  source?: WardenSource;
  cursor?: number;
  limit?: number;
}): Promise<WardenPage<WardenAuditView>> {
  const limit = query.limit ?? PAGE_SIZE;
  const rows = await db
    .select({ entry: wardenAudit, targetName: user.name })
    .from(wardenAudit)
    .leftJoin(user, eq(user.id, wardenAudit.targetUserId))
    .where(
      and(
        query.userId ? eq(wardenAudit.targetUserId, query.userId) : undefined,
        query.action ? eq(wardenAudit.action, query.action as WardenAuditAction) : undefined,
        query.source ? eq(wardenAudit.source, query.source) : undefined,
        query.cursor ? lt(wardenAudit.id, query.cursor) : undefined,
      ),
    )
    .orderBy(desc(wardenAudit.id))
    .limit(limit + 1);
  const page = rows.slice(0, limit);
  const names = await namesOf(
    db,
    page.map((row) => row.entry.actorUserId),
  );
  return {
    items: page.map(({ entry, targetName }) => ({
      id: entry.id,
      at: entry.at.toISOString(),
      action: entry.action,
      source: entry.source,
      actor: actorView(names, entry.source, entry.actorUserId, {
        uuid: entry.actorMinecraftUuid,
        name: entry.actorMinecraftName,
      }),
      target: entry.targetUserId ? { userId: entry.targetUserId, name: targetName } : null,
      targetMinecraftUuid: entry.targetMinecraftUuid,
      data: entry.data,
    })),
    nextCursor: rows.length > limit && page.length ? String(page.at(-1)!.entry.id) : null,
  };
}

async function settings(): Promise<WardenSettingsView> {
  return wardenSettingsService.get();
}

async function updateSettings(input: {
  patch: Partial<WardenSettingsView>;
  actor: WardenActor & { source: 'web' };
}): Promise<WardenSettingsView> {
  return db.transaction(async (tx) => {
    const [updated] = await tx
      .update(wardenSettings)
      .set({ ...input.patch, updatedAt: new Date(), updatedByUserId: input.actor.userId })
      .where(eq(wardenSettings.id, 1))
      .returning({
        defaultMaxAccounts: wardenSettings.defaultMaxAccounts,
        allowCracked: wardenSettings.allowCracked,
      });
    // The resulting settings too, so a replayed event carries the values of that time.
    await wardenAuditService.record(tx, {
      action: 'settings.update',
      actor: input.actor,
      data: { changed: input.patch, settings: updated },
    });
    return updated!;
  });
}

/** LNB players of Warden's schools, by name or email, for admin pickers (such as the mod editor). */
async function searchUsers(q: string): Promise<WardenUserOption[]> {
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const app = getLinkApp('warden');
  const rows = await db
    .select({
      userId: user.id,
      name: user.name,
      email: user.email,
      image: user.image,
      tenantId: user.tenantId,
    })
    .from(user)
    .where(or(ilike(user.name, pattern), ilike(user.email, pattern)))
    .orderBy(user.name)
    .limit(20);
  return rows
    .filter((row) => app && canLinkFromSchool(app, row.tenantId))
    .slice(0, 8)
    .map(({ userId, name, email, image }) => ({ userId, name, email, image }));
}

export const wardenAdminService = {
  searchUsers,
  players,
  player,
  setMaxAccounts,
  setWardenAdmin,
  audit: auditEntries,
  settings,
  updateSettings,
};
