import { and, asc, count, eq, gt, inArray, isNull, or, sql } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import {
  anticheatFile,
  anticheatPlayer,
  anticheatUsage,
  economyAccount,
  event,
  eventRegistration,
  minecraftAccount,
  playtimeLedger,
  user,
  wardenAccountTransfer,
  wardenBan,
  wardenPlayer,
  wardenSession,
} from '~~/server/db/schema';
import { playerBandOf } from '~~/server/services/anticheat/rules';
import { anticheatSettingsService } from '~~/server/services/anticheat/settings';
import { weekStart } from '~~/server/services/playtime/rules';
import { isBanActive, isOnline } from '~~/server/services/warden/rules';

import { asUuid, fileNeedsLook, inactiveBefore, peopleAccess, peopleWhere } from './access';
import type { PeopleAccess } from './access';

import type {
  AdminPeopleFilters,
  AdminPeoplePage,
  AdminPersonRow,
  AdminRoleFlags,
} from '#shared/schemas/admin';
import {
  ECONOMY_ADMIN_ROLE,
  EVENTS_MANAGER_ROLE,
  hasRole,
  isAdmin,
  WARDEN_ADMIN_ROLE,
} from '#shared/utils/roles';
import { schoolForTenant } from '#shared/utils/schools';

// The People list: everyone, 50 per page by name, with the columns the caller's role may see.
// One query for the page and one more per column group, each by the page's IDs, so the cost
// doesn't grow with the page. Filters go through `peopleWhere`.

const PAGE_SIZE = 50;

export function rolesOf(role: string | null): AdminRoleFlags {
  return {
    admin: isAdmin(role),
    wardenAdmin: hasRole(role, WARDEN_ADMIN_ROLE),
    eventsManager: hasRole(role, EVENTS_MANAGER_ROLE),
    economyAdmin: hasRole(role, ECONOMY_ADMIN_ROLE),
  };
}

function encodeCursor(name: string, id: string): string {
  return Buffer.from(JSON.stringify([name, id])).toString('base64url');
}

function decodeCursor(cursor: string): { name: string; id: string } {
  try {
    const value: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (Array.isArray(value) && typeof value[0] === 'string' && typeof value[1] === 'string') {
      return { name: value[0], id: value[1] };
    }
  } catch {
    // Falls through to the refusal.
  }
  throw createError({
    status: 400,
    statusText: 'invalidCursor',
    data: { problem: 'invalidCursor' },
  });
}

/** The account owning a Minecraft name or UUID typed exactly, so the search can open it. */
async function exactMatch(q: string): Promise<{ userId: string } | null> {
  const uuid = asUuid(q);
  const [row] = await db
    .select({ userId: minecraftAccount.userId })
    .from(minecraftAccount)
    .where(
      uuid
        ? eq(minecraftAccount.uuid, uuid)
        : and(
            sql`lower(${minecraftAccount.username}) = ${q.toLowerCase()}`,
            isNull(minecraftAccount.unlinkedAt),
          ),
    )
    .orderBy(asc(minecraftAccount.linkedAt))
    .limit(1);
  return row ? { userId: row.userId } : null;
}

type Page = { id: string; role: string | null };

/** Minecraft accounts, bans, takeovers and playtime of the page's players. */
async function minecraftColumns(ids: string[], now: Date) {
  const [accounts, sessions, bans, transfers, players] = await Promise.all([
    db.select().from(minecraftAccount).where(inArray(minecraftAccount.userId, ids)),
    db
      .select({
        userId: wardenSession.userId,
        minecraftUuid: wardenSession.minecraftUuid,
        endedAt: wardenSession.endedAt,
        lastHeartbeatAt: wardenSession.lastHeartbeatAt,
      })
      .from(wardenSession)
      .where(and(inArray(wardenSession.userId, ids), isNull(wardenSession.endedAt))),
    db
      .select()
      .from(wardenBan)
      .where(and(inArray(wardenBan.userId, ids), isNull(wardenBan.revokedAt))),
    db
      .select({ from: wardenAccountTransfer.fromUserId, to: wardenAccountTransfer.toUserId })
      .from(wardenAccountTransfer)
      .where(
        and(
          isNull(wardenAccountTransfer.dismissedAt),
          or(
            inArray(wardenAccountTransfer.fromUserId, ids),
            inArray(wardenAccountTransfer.toUserId, ids),
          ),
        ),
      ),
    db
      .select({ userId: wardenPlayer.userId, seconds: wardenPlayer.transferredPlaytimeSeconds })
      .from(wardenPlayer)
      .where(inArray(wardenPlayer.userId, ids)),
  ]);
  return (userId: string): Pick<AdminPersonRow, 'minecraft' | 'ban'> => {
    const own = accounts.filter((account) => account.userId === userId);
    const lastSeen = own
      .map((account) => account.lastSeenAt)
      .filter((at): at is Date => at !== null)
      .sort((a, b) => a.getTime() - b.getTime())
      .at(-1);
    const ban = bans.find((b) => b.userId === userId && isBanActive(b, now));
    const gained = transfers.some((t) => t.to === userId);
    const lost = transfers.some((t) => t.from === userId);
    return {
      minecraft: {
        accounts: own
          .filter((account) => account.unlinkedAt === null)
          .map((account) => ({
            uuid: account.uuid,
            username: account.username,
            online: sessions.some(
              (s) => s.minecraftUuid === account.uuid && isOnline(s, now.getTime()),
            ),
          })),
        lastSeenAt: lastSeen?.toISOString() ?? null,
        // Accounts the player unlinked or lost to a takeover keep counting.
        playtimeSeconds:
          own.reduce((sum, account) => sum + account.playtimeSeconds, 0) +
          (players.find((player) => player.userId === userId)?.seconds ?? 0),
        transferWarning: gained && lost ? 'both' : gained ? 'in' : lost ? 'out' : null,
      },
      ban: ban
        ? { id: ban.id, reason: ban.reason, expiresAt: ban.expiresAt?.toISOString() ?? null }
        : null,
    };
  };
}

/** Trust scores and the players who use a file that needs a look. */
async function anticheatColumns(ids: string[]) {
  const [{ rules }, players, flagged] = await Promise.all([
    anticheatSettingsService.get(),
    db.select().from(anticheatPlayer).where(inArray(anticheatPlayer.userId, ids)),
    db
      .selectDistinct({ userId: anticheatUsage.userId })
      .from(anticheatUsage)
      .innerJoin(anticheatFile, eq(anticheatFile.sha512, anticheatUsage.sha512))
      .where(and(inArray(anticheatUsage.userId, ids), fileNeedsLook)),
  ]);
  const withFile = new Set(flagged.map((row) => row.userId));
  return (userId: string): AdminPersonRow['anticheat'] => {
    const player = players.find((row) => row.userId === userId);
    if (!player) return null;
    const band = playerBandOf(player.score, rules);
    return {
      score: player.score,
      band,
      manualHold: player.manualHold,
      flagged: player.manualHold || band === 'held' || band === 'zero' || withFile.has(userId),
    };
  };
}

/** Players who played past their allowance this week. */
async function overLimitIds(ids: string[], now: Date): Promise<Set<string>> {
  const rows = await db
    .selectDistinct({ userId: playtimeLedger.userId })
    .from(playtimeLedger)
    .where(
      and(
        inArray(playtimeLedger.userId, ids),
        eq(playtimeLedger.weekStart, weekStart(now.getTime())),
        sql`${playtimeLedger.overSeconds} > 0`,
      ),
    );
  return new Set(rows.map((row) => row.userId));
}

async function balances(ids: string[]): Promise<Map<string, number>> {
  const rows = await db
    .select({ userId: economyAccount.ownerUserId, balance: economyAccount.balance })
    .from(economyAccount)
    .where(and(eq(economyAccount.kind, 'personal'), inArray(economyAccount.ownerUserId, ids)));
  return new Map(rows.flatMap((row) => (row.userId ? [[row.userId, row.balance] as const] : [])));
}

async function registrationCounts(ids: string[], now: Date) {
  const rows = await db
    .select({
      userId: eventRegistration.userId,
      total: count(),
      upcoming: sql<number>`count(*) filter (where ${gt(event.endsAt, now)})`.mapWith(Number),
    })
    .from(eventRegistration)
    .innerJoin(event, eq(event.id, eventRegistration.eventId))
    .where(inArray(eventRegistration.userId, ids))
    .groupBy(eventRegistration.userId);
  return new Map(rows.map((row) => [row.userId, row] as const));
}

/** One page of people, by name. The caller's role decides the columns and the filters. */
async function list(role: string | null, query: AdminPeopleFilters & { cursor?: string }) {
  const access: PeopleAccess = peopleAccess(role);
  const now = new Date();
  const where = await peopleWhere(access, query, now);
  const after = query.cursor ? decodeCursor(query.cursor) : undefined;

  const [rows, [matching], match] = await Promise.all([
    db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
        tenantId: user.tenantId,
        role: user.role,
        ghost: user.ghost,
        createdAt: user.createdAt,
        lastSignInAt: user.lastSignInAt,
        banned: user.banned,
        banReason: user.banReason,
        banExpires: user.banExpires,
      })
      .from(user)
      .where(
        and(
          where,
          after ? sql`(${user.name}, ${user.id}) > (${after.name}, ${after.id})` : undefined,
        ),
      )
      .orderBy(asc(user.name), asc(user.id))
      .limit(PAGE_SIZE + 1),
    db.select({ total: count() }).from(user).where(where),
    query.q && !query.cursor && (access.warden || access.economy)
      ? exactMatch(query.q)
      : Promise.resolve(null),
  ]);

  const page: Page[] = rows.slice(0, PAGE_SIZE);
  const ids = page.map((row) => row.id);
  const [minecraft, anticheat, over, balance, registrations] = ids.length
    ? await Promise.all([
        access.warden ? minecraftColumns(ids, now) : undefined,
        access.warden ? anticheatColumns(ids) : undefined,
        access.warden ? overLimitIds(ids, now) : undefined,
        access.economy ? balances(ids) : undefined,
        access.events ? registrationCounts(ids, now) : undefined,
      ])
    : [];

  const cutoff = inactiveBefore(now);
  const items = rows.slice(0, PAGE_SIZE).map((row): AdminPersonRow => {
    const person: AdminPersonRow = {
      userId: row.id,
      name: row.name,
      image: row.image,
      school: schoolForTenant(row.tenantId) ?? null,
      ghost: row.ghost,
    };
    if (access.warden) {
      person.email = row.email;
      person.roles = rolesOf(row.role);
      Object.assign(person, minecraft?.(row.id));
      person.anticheat = anticheat?.(row.id) ?? null;
      person.overLimit = over?.has(row.id) ?? false;
    }
    if (access.admin) {
      person.lastSignInAt = row.lastSignInAt?.toISOString() ?? null;
      person.inactive = (row.lastSignInAt ?? row.createdAt) < cutoff;
      person.siteBan =
        row.banned && (!row.banExpires || row.banExpires > now)
          ? { reason: row.banReason, expiresAt: row.banExpires?.toISOString() ?? null }
          : null;
    }
    if (access.economy) person.balance = balance?.get(row.id) ?? null;
    if (access.events) {
      const counts = registrations?.get(row.id);
      person.registrations = { upcoming: counts?.upcoming ?? 0, total: counts?.total ?? 0 };
    }
    return person;
  });

  const last = page.at(-1) ? rows[page.length - 1] : undefined;
  return {
    items,
    nextCursor: rows.length > PAGE_SIZE && last ? encodeCursor(last.name, last.id) : null,
    total: matching?.total ?? 0,
    match,
  } satisfies AdminPeoplePage;
}

export const peopleListService = { list };
