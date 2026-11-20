import { and, eq, exists, gt, ilike, isNull, lt, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import {
  anticheatFile,
  anticheatPlayer,
  anticheatUsage,
  minecraftAccount,
  playtimeLedger,
  user,
  wardenBan,
} from '~~/server/db/schema';
import { anticheatSettingsService } from '~~/server/services/anticheat/settings';
import { weekStart } from '~~/server/services/playtime/rules';

import type { AdminPeopleFilter, AdminPeopleFilters } from '#shared/schemas/admin';
import {
  isAdmin,
  isEconomyAdmin,
  isEventsManager,
  isWardenAdmin,
  ECONOMY_ADMIN_ROLE,
  EVENTS_MANAGER_ROLE,
  WARDEN_ADMIN_ROLE,
  ADMIN_ROLE,
} from '#shared/utils/roles';

// Who sees what in People (docs/plans/admin-redesign.md). The list and the summary read these
// capabilities, so the guard per role is in one place. Site admins pass every check.

export interface PeopleAccess {
  /** Site admins: site account fields, roles, every filter. */
  admin: boolean;
  /** Warden admins: Minecraft, moderation, anticheat and playtime data, and emails. */
  warden: boolean;
  /** Events managers: registrations, and a search by email. */
  events: boolean;
  /** Economy admins: balances, and a search by Minecraft name. */
  economy: boolean;
}

export function peopleAccess(role: string | null | undefined): PeopleAccess {
  return {
    admin: isAdmin(role),
    warden: isWardenAdmin(role),
    events: isEventsManager(role),
    economy: isEconomyAdmin(role),
  };
}

export function canOpenPeople(access: PeopleAccess): boolean {
  return access.warden || access.events || access.economy;
}

/** Which roles may use each quick filter. `ghost` is open to everyone with People. */
const FILTER_ACCESS: Record<AdminPeopleFilter, (access: PeopleAccess) => boolean> = {
  banned: (access) => access.warden,
  flagged: (access) => access.warden,
  overLimit: (access) => access.warden,
  hasRole: (access) => access.warden,
  inactive: (access) => access.admin,
  ghost: () => true,
};

export function refuseNotAllowed(): never {
  throw createError({ status: 403, statusText: 'notAllowed', data: { problem: 'notAllowed' } });
}

/** The 24 months after which an account with no sign-in is deleted. */
const INACTIVE_MONTHS = 24;

/** The time before which an account counts as inactive. */
export function inactiveBefore(now = new Date()): Date {
  const date = new Date(now);
  date.setMonth(date.getMonth() - INACTIVE_MONTHS);
  return date;
}

// Accounts that never signed in since last_sign_in_at was added count from their creation.
export const lastActive = sql`coalesce(${user.lastSignInAt}, ${user.createdAt})`;

/** Roles are a comma-separated list, so match a whole name. */
export const roleMatch = (name: string) =>
  sql`${name} = any(string_to_array(replace(coalesce(${user.role}, ''), ' ', ''), ','))`;

export function siteBanActive(now: Date) {
  return and(eq(user.banned, true), or(isNull(user.banExpires), gt(user.banExpires, now)));
}

export function wardenBanActive(now: Date) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(wardenBan)
      .where(
        and(
          eq(wardenBan.userId, user.id),
          isNull(wardenBan.revokedAt),
          or(isNull(wardenBan.expiresAt), gt(wardenBan.expiresAt, now)),
        ),
      ),
  );
}

/**
 * Whether an anticheat file needs a look: its status (see `fileStatus`) is `review`, `refused`
 * or `banned`. The same rule as `fileStatus` in SQL, so the list can filter on it.
 */
export const fileNeedsLook = sql`(
  ${anticheatFile.kind} <> 'client' and ${anticheatFile.band} is not null and (
    ${anticheatFile.band} = 'banned' or (
      ${anticheatFile.kind} <> 'shader' and (
        ${anticheatFile.band} in ('low', 'middle')
        or (${anticheatFile.band} = 'accepted' and ${anticheatFile.reviewedBand} is distinct from 'accepted')
      )
    )
  )
)`;

/** Players the anticheat holds, or who use a file that needs a look. */
function flaggedWhere(held: number) {
  return or(
    exists(
      db
        .select({ one: sql`1` })
        .from(anticheatPlayer)
        .where(
          and(
            eq(anticheatPlayer.userId, user.id),
            or(eq(anticheatPlayer.manualHold, true), lt(anticheatPlayer.score, held)),
          ),
        ),
    ),
    exists(
      db
        .select({ one: sql`1` })
        .from(anticheatUsage)
        .innerJoin(anticheatFile, eq(anticheatFile.sha512, anticheatUsage.sha512))
        .where(and(eq(anticheatUsage.userId, user.id), fileNeedsLook)),
    ),
  );
}

function overLimitWhere(now: Date) {
  return exists(
    db
      .select({ one: sql`1` })
      .from(playtimeLedger)
      .where(
        and(
          eq(playtimeLedger.userId, user.id),
          eq(playtimeLedger.weekStart, weekStart(now.getTime())),
          sql`${playtimeLedger.overSeconds} > 0`,
        ),
      ),
  );
}

const UUID = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;

/** A Minecraft UUID typed with or without dashes, with them, in lower case. Null if it isn't one. */
export function asUuid(text: string): string | null {
  if (!UUID.test(text)) return null;
  const hex = text.replaceAll('-', '').toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function searchWhere(q: string, access: PeopleAccess) {
  const pattern = `%${q.replace(/[\\%_]/g, '\\$&')}%`;
  const uuid = asUuid(q);
  const minecraft = access.warden || access.economy;
  return or(
    ilike(user.name, pattern),
    access.warden || access.events ? ilike(user.email, pattern) : undefined,
    minecraft
      ? exists(
          db
            .select({ one: sql`1` })
            .from(minecraftAccount)
            .where(
              and(
                eq(minecraftAccount.userId, user.id),
                uuid ? eq(minecraftAccount.uuid, uuid) : ilike(minecraftAccount.username, pattern),
              ),
            ),
        )
      : undefined,
  );
}

/**
 * The WHERE of the People list for a caller. A filter the caller's role can't see is refused with
 * a 403 (`notAllowed`), so a role never learns anything through a filter.
 */
export async function peopleWhere(
  access: PeopleAccess,
  query: AdminPeopleFilters,
  now = new Date(),
): Promise<SQL | undefined> {
  const filters = new Set(query.filters ?? []);
  for (const filter of filters) if (!FILTER_ACCESS[filter](access)) refuseNotAllowed();
  if (query.role && query.role !== 'any' && !access.admin) refuseNotAllowed();

  const held = filters.has('flagged')
    ? (await anticheatSettingsService.get()).rules.player.held
    : 0;
  return and(
    query.q ? searchWhere(query.q, access) : undefined,
    query.tenantId ? eq(user.tenantId, query.tenantId) : undefined,
    !query.role || query.role === 'any' ? undefined : roleMatch(query.role),
    filters.has('banned')
      ? access.admin
        ? or(siteBanActive(now), wardenBanActive(now))
        : wardenBanActive(now)
      : undefined,
    filters.has('flagged') ? flaggedWhere(held) : undefined,
    filters.has('overLimit') ? overLimitWhere(now) : undefined,
    filters.has('ghost') ? eq(user.ghost, true) : undefined,
    filters.has('hasRole')
      ? or(
          roleMatch(ADMIN_ROLE),
          roleMatch(WARDEN_ADMIN_ROLE),
          roleMatch(EVENTS_MANAGER_ROLE),
          roleMatch(ECONOMY_ADMIN_ROLE),
        )
      : undefined,
    filters.has('inactive') ? lt(lastActive, inactiveBefore(now)) : undefined,
  );
}
