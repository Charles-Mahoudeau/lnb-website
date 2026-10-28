import { and, count, countDistinct, desc, eq, gte, isNotNull, max, sql } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import { shortLink, shortLinkClick, user } from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';
import { flagService } from '~~/server/services/flags';

import type {
  ShortLinkBody,
  ShortLinkDetail,
  ShortLinkList,
  ShortLinkListItem,
  ShortLinkPatchBody,
  ShortLinkProblem,
  ShortLinkPublic,
} from '#shared/schemas/short-links';
import { schoolForTenant } from '#shared/utils/schools';
import { decideAccess, isPreviewRequest, randomShortId } from '#shared/utils/short-links';
import type { GateDecision, LinkAccess } from '#shared/utils/short-links';

// The short links at /go/:shortId: an admin makes one, and following it redirects after the
// access check, counting the click and, when the link says so, who clicked. See docs/short-links.md.

type Row = typeof shortLink.$inferSelect;

function refuse(status: number, problem: ShortLinkProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

function isUniqueViolation(error: unknown): boolean {
  return (
    (error as { code?: string; cause?: { code?: string } }).code === '23505' ||
    (error as { cause?: { code?: string } }).cause?.code === '23505'
  );
}

/** Access fields that can't contradict each other, whatever the admin sent. */
function normalize(link: {
  access: LinkAccess;
  tenantIds: string[];
  recordClicks: boolean;
}): typeof link {
  return {
    access: link.access,
    tenantIds: link.access === 'schools' ? [...new Set(link.tenantIds)] : [],
    recordClicks: link.access === 'any' ? false : link.recordClicks,
  };
}

// Admin

function item(row: Row, stats: { clicks: number; people: number } | undefined): ShortLinkListItem {
  return {
    id: row.id,
    shortId: row.shortId,
    name: row.name,
    destinationUrl: row.destinationUrl,
    access: row.access as LinkAccess,
    tenantIds: row.tenantIds,
    recordClicks: row.recordClicks,
    enabled: row.enabled,
    createdAt: row.createdAt.toISOString(),
    clicks: stats?.clicks ?? 0,
    people: stats?.people ?? 0,
  };
}

async function listAdmin(baseUrl: string): Promise<ShortLinkList> {
  const rows = await db.select().from(shortLink).orderBy(desc(shortLink.createdAt));
  const stats = await db
    .select({
      linkId: shortLinkClick.linkId,
      clicks: count(),
      people: countDistinct(shortLinkClick.userId),
    })
    .from(shortLinkClick)
    .where(eq(shortLinkClick.outcome, 'opened'))
    .groupBy(shortLinkClick.linkId);
  const byLink = new Map(stats.map((s) => [s.linkId, s]));
  return { links: rows.map((row) => item(row, byLink.get(row.id))), baseUrl };
}

/** `YYYY-MM-DD` of an instant in Paris time. */
function parisDay(date: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(date);
}

const DAYS = 30;

async function detail(id: string): Promise<ShortLinkDetail> {
  const [row] = await db.select().from(shortLink).where(eq(shortLink.id, id));
  if (!row) refuse(404, 'shortLinkNotFound');
  const opened = and(eq(shortLinkClick.linkId, id), eq(shortLinkClick.outcome, 'opened'));

  const [totals] = await db
    .select({
      clicks: count(),
      signedIn: count(sql`case when ${shortLinkClick.signedIn} then 1 end`),
      people: countDistinct(shortLinkClick.userId),
    })
    .from(shortLinkClick)
    .where(opened);
  const [refused] = await db
    .select({ n: count() })
    .from(shortLinkClick)
    .where(and(eq(shortLinkClick.linkId, id), eq(shortLinkClick.outcome, 'wrongSchool')));

  // Paris days, so a click at 00:30 on the 21st counts on the 21st.
  const dayExpr = sql<string>`to_char((${shortLinkClick.at} at time zone 'UTC') at time zone 'Europe/Paris', 'YYYY-MM-DD')`;
  const perDay = await db
    .select({
      day: dayExpr,
      signedIn: count(sql`case when ${shortLinkClick.signedIn} then 1 end`),
      anonymous: count(sql`case when not ${shortLinkClick.signedIn} then 1 end`),
    })
    .from(shortLinkClick)
    .where(and(opened, gte(shortLinkClick.at, new Date(Date.now() - (DAYS + 1) * 86_400_000))))
    .groupBy(dayExpr);
  const dayMap = new Map(perDay.map((d) => [d.day, d]));
  const days = Array.from({ length: DAYS }, (_, i) => {
    const day = parisDay(new Date(Date.now() - (DAYS - 1 - i) * 86_400_000));
    return {
      day,
      signedIn: dayMap.get(day)?.signedIn ?? 0,
      anonymous: dayMap.get(day)?.anonymous ?? 0,
    };
  });

  const bySchool = await db
    .select({ tenantId: shortLinkClick.tenantId, people: countDistinct(shortLinkClick.userId) })
    .from(shortLinkClick)
    .where(and(opened, isNotNull(shortLinkClick.userId)))
    .groupBy(shortLinkClick.tenantId);
  const schools = bySchool
    .map((s) => ({
      school: (s.tenantId && schoolForTenant(s.tenantId)) || '',
      people: s.people,
    }))
    .filter((s) => s.school)
    .sort((a, b) => b.people - a.people);

  const recentRows = await db
    .select({
      userId: shortLinkClick.userId,
      name: user.name,
      image: user.image,
      tenantId: user.tenantId,
      clicks: count(),
      lastAt: max(shortLinkClick.at),
    })
    .from(shortLinkClick)
    .innerJoin(user, eq(user.id, shortLinkClick.userId))
    .where(opened)
    .groupBy(shortLinkClick.userId, user.name, user.image, user.tenantId)
    .orderBy(desc(max(shortLinkClick.at)))
    .limit(50);

  return {
    ...item(row, { clicks: totals!.clicks, people: totals!.people }),
    signedInClicks: totals!.signedIn,
    anonymousClicks: totals!.clicks - totals!.signedIn,
    refused: refused!.n,
    days,
    schools,
    recent: recentRows.map((r) => ({
      userId: r.userId!,
      name: r.name,
      image: r.image,
      school: schoolForTenant(r.tenantId) ?? null,
      clicks: r.clicks,
      lastAt: r.lastAt!.toISOString(),
    })),
    trackingOff: !(await flagService.isEnabled('shortLinks.tracking')),
  };
}

async function create(input: {
  /** Null when an API key acts: `actorData` then says which. */
  actorId: string | null;
  actorData?: Record<string, unknown>;
  body: ShortLinkBody;
}): Promise<{ id: string; shortId: string }> {
  const { body } = input;
  const access = normalize(body);
  // An empty ID asks for a random one: try again on the rare collision.
  for (let attempt = 0; attempt < 5; attempt++) {
    const shortId = body.shortId || randomShortId();
    try {
      return await db.transaction(async (tx) => {
        const [row] = await tx
          .insert(shortLink)
          .values({
            shortId,
            name: body.name,
            destinationUrl: body.destinationUrl,
            ...access,
            enabled: body.enabled,
            createdBy: input.actorId,
          })
          .returning();
        await adminAuditService.record(tx, {
          action: 'shortLink.create',
          actorUserId: input.actorId,
          targetUserId: null,
          data: { id: row!.shortId, name: row!.name, ...input.actorData },
        });
        return { id: row!.id, shortId: row!.shortId };
      });
    } catch (error) {
      if (!isUniqueViolation(error)) throw error;
      if (body.shortId) refuse(409, 'shortIdTaken');
    }
  }
  refuse(409, 'shortIdTaken');
}

async function update(input: {
  actorId: string;
  id: string;
  patch: ShortLinkPatchBody;
}): Promise<void> {
  const { patch } = input;
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(shortLink)
      .where(eq(shortLink.id, input.id))
      .for('update');
    if (!current) refuse(404, 'shortLinkNotFound');
    const access = normalize({
      access: patch.access ?? (current.access as LinkAccess),
      tenantIds: patch.tenantIds ?? current.tenantIds,
      recordClicks: patch.recordClicks ?? current.recordClicks,
    });
    // Schools need at least one school: the body check can't see the stored ones.
    if (access.access === 'schools' && access.tenantIds.length === 0) {
      throw createError({ status: 400, statusText: 'Bad Request' });
    }
    const [row] = await tx
      .update(shortLink)
      .set({
        name: patch.name,
        destinationUrl: patch.destinationUrl,
        enabled: patch.enabled,
        ...access,
      })
      .where(eq(shortLink.id, input.id))
      .returning();
    await adminAuditService.record(tx, {
      action: 'shortLink.update',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { id: row!.shortId, name: row!.name, patch },
    });
  });
}

async function remove(input: { actorId: string; id: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(shortLink).where(eq(shortLink.id, input.id)).returning();
    if (!row) refuse(404, 'shortLinkNotFound');
    await adminAuditService.record(tx, {
      action: 'shortLink.delete',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { id: row.shortId, name: row.name },
    });
  });
}

/** A spreadsheet can run a cell that starts with one of these, so it gets a quote in front. */
function csvCell(value: string): string {
  const safe = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

/** Who clicked, one line per click, as CSV. Writes an audit row: it hands out names and emails. */
async function exportClicks(input: {
  actorId: string;
  id: string;
}): Promise<{ name: string; csv: string }> {
  const [row] = await db.select().from(shortLink).where(eq(shortLink.id, input.id));
  if (!row) refuse(404, 'shortLinkNotFound');
  const clicks = await db
    .select({ at: shortLinkClick.at, name: user.name, email: user.email, tenantId: user.tenantId })
    .from(shortLinkClick)
    .innerJoin(user, eq(user.id, shortLinkClick.userId))
    .where(and(eq(shortLinkClick.linkId, input.id), eq(shortLinkClick.outcome, 'opened')))
    .orderBy(desc(shortLinkClick.at));
  await db.transaction((tx) =>
    adminAuditService.record(tx, {
      action: 'shortLink.export',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { id: row.shortId, name: row.name, rows: clicks.length },
    }),
  );
  const lines = [
    ['date', 'name', 'email', 'school'].map(csvCell).join(','),
    ...clicks.map((c) =>
      [c.at.toISOString(), c.name, c.email, schoolForTenant(c.tenantId) ?? '']
        .map(csvCell)
        .join(','),
    ),
  ];
  return { name: `${row.shortId}-clicks.csv`, csv: lines.join('\r\n') + '\r\n' };
}

// Public

/** What the page behind a refused link needs. No destination: it stays behind the access check. */
async function publicInfo(shortId: string): Promise<ShortLinkPublic> {
  const [row] = await db.select().from(shortLink).where(eq(shortLink.shortId, shortId));
  const on = (await flagService.isEnabled('shortLinks')) && row?.enabled === true;
  if (!row || !on) return { state: 'off', access: 'any', schools: [], recordClicks: false };
  return {
    state: 'available',
    access: row.access as LinkAccess,
    schools: row.tenantIds.map((tid) => schoolForTenant(tid)).filter((s): s is string => !!s),
    recordClicks: row.recordClicks && (await flagService.isEnabled('shortLinks.tracking')),
  };
}

export type FollowResult =
  | { kind: 'redirect'; url: string }
  | { kind: 'blocked'; reason: Exclude<GateDecision, 'open'> | 'off' };

export interface Viewer {
  id: string;
  tenantId: string;
}

/**
 * Follows a link: checks the flag and the access, counts the click and sends the visitor on.
 * Link previews and crawlers get the redirect without being counted.
 */
async function follow(input: {
  shortId: string;
  viewer: Viewer | null;
  method: string;
  userAgent: string | undefined;
}): Promise<FollowResult> {
  if (!(await flagService.isEnabled('shortLinks'))) return { kind: 'blocked', reason: 'off' };
  const [row] = await db.select().from(shortLink).where(eq(shortLink.shortId, input.shortId));
  if (!row?.enabled) return { kind: 'blocked', reason: 'off' };

  const decision = decideAccess(
    { access: row.access as LinkAccess, tenantIds: row.tenantIds },
    input.viewer?.tenantId ?? null,
  );
  if (decision === 'signIn') return { kind: 'blocked', reason: 'signIn' };

  const counted = !isPreviewRequest(input.method, input.userAgent);
  const who =
    input.viewer && row.recordClicks && (await flagService.isEnabled('shortLinks.tracking'))
      ? { userId: input.viewer.id, tenantId: input.viewer.tenantId.toLowerCase() }
      : { userId: null, tenantId: null };
  if (counted) {
    await db.insert(shortLinkClick).values({
      linkId: row.id,
      outcome: decision === 'open' ? 'opened' : 'wrongSchool',
      signedIn: input.viewer !== null,
      // A refused visitor is not identified: only a followed link records who.
      ...(decision === 'open' ? who : { userId: null, tenantId: null }),
    });
  }
  return decision === 'open'
    ? { kind: 'redirect', url: row.destinationUrl }
    : { kind: 'blocked', reason: 'wrongSchool' };
}

export const shortLinkService = {
  listAdmin,
  detail,
  create,
  update,
  remove,
  exportClicks,
  publicInfo,
  follow,
};
