import { and, count, eq, gt, isNotNull, isNull, lt, or, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import {
  event,
  mod,
  modpackMod,
  user,
  wardenAccountTransfer,
  wardenAppeal,
} from '~~/server/db/schema';
import { anticheatAlertService } from '~~/server/services/anticheat/alerts';
import { apiKeyService } from '~~/server/services/api-keys';
import { flagService } from '~~/server/services/flags';
import { inactiveBefore } from '~~/server/services/people/access';
import { rateLimitModeService } from '~~/server/services/rate-limit-mode';

import type { AdminInbox, AdminInboxItem } from '#shared/schemas/admin';
import { isAdmin, isEventsManager, isWardenAdmin } from '#shared/utils/roles';

// The admin Home: what is waiting for the caller's roles, and the sidebar's counts. Counts only,
// from the queues the admin already has (no new data, no usage figures). Each role gets the
// queues it can act on, most important first.

const iso = (value: Date | string | null | undefined) =>
  value ? new Date(value).toISOString() : null;

/** Ban appeals nobody has answered. */
async function appeals(): Promise<AdminInboxItem | undefined> {
  const [row] = await db
    .select({ n: count(), oldest: sql<Date | null>`min(${wardenAppeal.createdAt})` })
    .from(wardenAppeal)
    .where(eq(wardenAppeal.status, 'pending'));
  if (!row?.n) return undefined;
  return {
    id: 'appeals',
    count: row.n,
    to: '/admin/moderation/appeals',
    at: iso(row.oldest),
    name: null,
  };
}

/** Minecraft account takeovers nobody has dismissed. The queue is People, filtered. */
async function transfers(): Promise<AdminInboxItem | undefined> {
  const [row] = await db
    .select({ n: count(), oldest: sql<Date | null>`min(${wardenAccountTransfer.createdAt})` })
    .from(wardenAccountTransfer)
    .where(isNull(wardenAccountTransfer.dismissedAt));
  if (!row?.n) return undefined;
  return {
    id: 'transfers',
    count: row.n,
    to: '/admin/people?filters=transfer',
    at: iso(row.oldest),
    name: null,
  };
}

async function anticheat(): Promise<AdminInboxItem | undefined> {
  const summary = await anticheatAlertService.summary();
  const total = summary.review + summary.alerts;
  if (!total) return undefined;
  return {
    id: 'anticheat',
    count: total,
    to: '/admin/anticheat/review',
    at: null,
    name: null,
    review: summary.review,
    alerts: summary.alerts,
  };
}

/** Suggestions in the mod vote, which only exists while the `modList` flag is on. */
async function suggestions(): Promise<AdminInboxItem | undefined> {
  if (!(await flagService.isEnabled('modList'))) return undefined;
  const [row] = await db
    .select({ n: count(), oldest: sql<Date | null>`min(${mod.createdAt})` })
    .from(mod)
    .where(and(eq(mod.list, 'suggestion'), eq(mod.status, 'visible')));
  if (!row?.n) return undefined;
  return {
    id: 'suggestions',
    count: row.n,
    to: '/admin/modpack/vote',
    at: iso(row.oldest),
    name: null,
  };
}

/** Mods of the Modlist with a newer file than the pinned one, found by the nightly check. */
async function modpackUpdates(): Promise<AdminInboxItem | undefined> {
  const where = and(
    isNull(modpackMod.attention),
    isNotNull(modpackMod.pinnedSha512),
    isNotNull(modpackMod.latestSha512),
    sql`${modpackMod.latestSha512} <> ${modpackMod.pinnedSha512}`,
  );
  const [row] = await db.select({ n: count() }).from(modpackMod).where(where);
  if (!row?.n) return undefined;
  const [first] = await db
    .select({ name: modpackMod.name })
    .from(modpackMod)
    .where(where)
    .orderBy(modpackMod.name)
    .limit(1);
  return {
    id: 'modpackUpdates',
    count: row.n,
    to: '/admin/modpack/modlist',
    at: null,
    name: first?.name ?? null,
  };
}

/** Upcoming events with people (or, in a tournament, teams) on the waitlist. */
async function eventWaitlists(now: Date): Promise<AdminInboxItem | undefined> {
  const { rows } = await db.execute<{
    id: string;
    name: string;
    starts_at: Date;
    waiting: number;
  }>(sql`
    select id, name, starts_at, waiting from (
      select e.id, e.name, e.starts_at,
        case when e.team_mode
          then (select count(*)::int from event_team t where t.event_id = e.id and t.status = 'waitlist')
          else (select count(*)::int from event_registration r where r.event_id = e.id and r.status = 'waitlist')
        end as waiting
      from ${event} e
      where e.ends_at > ${now} and e.cancelled_at is null
    ) waits
    where waiting > 0
    order by starts_at`);
  const first = rows[0];
  if (!first) return undefined;
  return {
    id: 'eventWaitlists',
    count: rows.length,
    to: rows.length === 1 ? `/admin/events/${first.id}` : '/admin/events',
    at: iso(first.starts_at),
    name: first.name,
    waiting: rows.reduce((sum, row) => sum + row.waiting, 0),
  };
}

/** Accounts with no sign-in for 24 months, which the nightly cleanup deletes. */
async function inactive(now: Date): Promise<AdminInboxItem | undefined> {
  const [row] = await db
    .select({ n: count() })
    .from(user)
    .where(lt(sql`coalesce(${user.lastSignInAt}, ${user.createdAt})`, inactiveBefore(now)));
  if (!row?.n) return undefined;
  return {
    id: 'inactive',
    count: row.n,
    to: '/admin/people?filters=inactive',
    at: null,
    name: null,
  };
}

async function siteBans(now: Date): Promise<AdminInboxItem | undefined> {
  const [row] = await db
    .select({ n: count() })
    .from(user)
    .where(and(eq(user.banned, true), or(isNull(user.banExpires), gt(user.banExpires, now))));
  if (!row?.n) return undefined;
  return { id: 'siteBans', count: row.n, to: '/admin/people?filters=banned', at: null, name: null };
}

async function apiKeysSoon(): Promise<AdminInboxItem | undefined> {
  const { soon } = await apiKeyService.overview();
  if (!soon) return undefined;
  return { id: 'apiKeys', count: soon, to: '/admin/settings/api-keys', at: null, name: null };
}

/** Anything but normal is on purpose, but is worth a reminder to switch back. */
async function rateLimit(): Promise<AdminInboxItem | undefined> {
  const mode = await rateLimitModeService.current();
  if (mode === 'normal') return undefined;
  return {
    id: 'rateLimit',
    count: 1,
    to: '/admin/settings/rate-limit',
    at: null,
    name: null,
    mode,
  };
}

/** The sidebar entry each queue counts toward, when it is work to do rather than a notice. */
const BADGE_ENTRY: Partial<Record<AdminInboxItem['id'], string>> = {
  appeals: 'moderation',
  transfers: 'people',
  anticheat: 'anticheat',
  eventWaitlists: 'events',
  suggestions: 'modpack',
  modpackUpdates: 'modpack',
};

async function inbox(role: string | null | undefined, now = new Date()): Promise<AdminInbox> {
  const warden = isWardenAdmin(role);
  const events = isEventsManager(role);
  const admin = isAdmin(role);
  // In order of importance. A role's queues are the only ones queried.
  const found = await Promise.all([
    warden ? appeals() : undefined,
    warden ? transfers() : undefined,
    warden ? anticheat() : undefined,
    admin ? apiKeysSoon() : undefined,
    admin ? rateLimit() : undefined,
    events ? eventWaitlists(now) : undefined,
    warden ? suggestions() : undefined,
    warden ? modpackUpdates() : undefined,
    admin ? inactive(now) : undefined,
    admin ? siteBans(now) : undefined,
  ]);
  const items = found.filter((item): item is AdminInboxItem => item !== undefined);
  const badges: Record<string, number> = {};
  for (const item of items) {
    const entry = BADGE_ENTRY[item.id];
    if (entry) badges[entry] = (badges[entry] ?? 0) + item.count;
  }
  return { items, badges };
}

export const adminInboxService = { inbox };
