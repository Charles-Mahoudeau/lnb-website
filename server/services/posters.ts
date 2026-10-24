import { and, asc, count, desc, eq, gt, inArray } from 'drizzle-orm';
import { createError } from 'nuxt/server';

import { db } from '~~/server/db';
import type { Tx } from '~~/server/db';
import {
  event,
  eventRoom,
  eventType,
  poster,
  shortLink,
  shortLinkClick,
  user,
} from '~~/server/db/schema';
import { siteUrl } from '~~/server/lib/site';
import { adminAuditService } from '~~/server/services/admin-audit';
import { shortLinkService } from '~~/server/services/short-links';

import type { PosterBody, PosterEvent, PosterProblem, PosterView } from '#shared/schemas/posters';
import { resolvePoster } from '#shared/utils/posters';
import type {
  PosterEventSource,
  PosterLocale,
  PosterTemplate,
  PosterTreatment,
} from '#shared/utils/posters';

// Posters made by events managers: a shared library, last write wins, each change in the admin
// log. The QR code goes through a short link made at the first save. See docs/posters.md.

type Row = typeof poster.$inferSelect;

interface EventInfo {
  endsAt: string;
  draft: boolean;
  cancelled: boolean;
  source: PosterEventSource;
}

interface LinkInfo {
  shortId: string;
  destinationUrl: string;
  clicks: number;
}

function refuse(status: number, problem: PosterProblem): never {
  throw createError({ status, statusText: problem, data: { problem } });
}

function eventPage(eventId: string): string {
  return siteUrl(`/events/${eventId}`);
}

async function eventInfo(ids: string[], tx: Tx | typeof db = db): Promise<Map<string, EventInfo>> {
  if (ids.length === 0) return new Map();
  const rows = await tx
    .select({ event, room: eventRoom, type: eventType })
    .from(event)
    .innerJoin(eventRoom, eq(eventRoom.id, event.roomId))
    .innerJoin(eventType, eq(eventType.id, event.typeId))
    .where(inArray(event.id, ids));
  return new Map(
    rows.map(({ event: e, room, type }) => [
      e.id,
      {
        endsAt: e.endsAt.toISOString(),
        draft: e.hidden,
        cancelled: e.cancelledAt !== null,
        source: {
          name: e.name,
          typeNameEn: type.nameEn,
          typeNameFr: type.nameFr,
          startsAt: e.startsAt.toISOString(),
          room: { name: room.name, details: room.details },
          schools: e.schools,
          banner: e.bannerKey
            ? { key: e.bannerKey, focusX: e.bannerFocusX, focusY: e.bannerFocusY }
            : null,
        },
      },
    ]),
  );
}

async function linkInfo(ids: string[]): Promise<Map<string, LinkInfo>> {
  if (ids.length === 0) return new Map();
  const rows = await db
    .select({
      id: shortLink.id,
      shortId: shortLink.shortId,
      destinationUrl: shortLink.destinationUrl,
      clicks: count(shortLinkClick.id),
    })
    .from(shortLink)
    .leftJoin(
      shortLinkClick,
      and(eq(shortLinkClick.linkId, shortLink.id), eq(shortLinkClick.outcome, 'opened')),
    )
    .where(inArray(shortLink.id, ids))
    .groupBy(shortLink.id);
  return new Map(rows.map(({ id, ...link }) => [id, link]));
}

/** Rows with what they need from their events, links and last editors. */
async function views(rows: { poster: Row; updatedBy: string | null }[]): Promise<PosterView[]> {
  const events = await eventInfo([...new Set(rows.flatMap((r) => r.poster.eventId ?? []))]);
  const links = await linkInfo([...new Set(rows.flatMap((r) => r.poster.shortLinkId ?? []))]);
  return rows.map(({ poster: p, updatedBy }) => {
    const info = p.eventId ? events.get(p.eventId) : undefined;
    const link = p.shortLinkId ? links.get(p.shortLinkId) : undefined;
    return {
      id: p.id,
      name: p.name,
      template: p.template as PosterTemplate,
      treatment: p.treatment as PosterTreatment | null,
      locale: p.locale as PosterLocale,
      overrides: p.overrides,
      content: p.content,
      event: info && p.eventId ? { id: p.eventId, ...info } : null,
      qr:
        link && p.shortLinkId
          ? {
              linkId: p.shortLinkId,
              shortId: link.shortId,
              url: siteUrl(`/go/${link.shortId}`),
              destinationUrl: link.destinationUrl,
              followsEvent: !!p.eventId && link.destinationUrl === eventPage(p.eventId),
              clicks: link.clicks,
            }
          : null,
      updatedAt: p.updatedAt.toISOString(),
      updatedBy,
    };
  });
}

function select() {
  return db
    .select({ poster, updatedBy: user.name })
    .from(poster)
    .leftJoin(user, eq(user.id, poster.updatedBy));
}

async function list(): Promise<PosterView[]> {
  return views(await select().orderBy(desc(poster.updatedAt)));
}

async function get(id: string): Promise<PosterView> {
  const [row] = await select().where(eq(poster.id, id));
  if (!row) refuse(404, 'posterNotFound');
  return (await views([row]))[0]!;
}

/** How long after its end an event can still get a poster, for a late print. */
const EVENT_CHOICE_GRACE_MS = 30 * 24 * 60 * 60 * 1000;

/** The events a poster can follow: not over, or over for less than 30 days. Soonest first. */
async function events(now = new Date()): Promise<PosterEvent[]> {
  const rows = await db
    .select({ id: event.id })
    .from(event)
    .where(gt(event.endsAt, new Date(now.getTime() - EVENT_CHOICE_GRACE_MS)))
    .orderBy(asc(event.startsAt));
  const info = await eventInfo(rows.map((r) => r.id));
  return rows.flatMap(({ id }) => {
    const found = info.get(id);
    return found ? [{ id, ...found }] : [];
  });
}

async function checkEvent(eventId: string | null): Promise<void> {
  if (!eventId) return;
  const [row] = await db.select({ id: event.id }).from(event).where(eq(event.id, eventId));
  if (!row) refuse(400, 'eventNotFound');
}

/**
 * The poster's short link after a save: made when the QR code is first turned on, and pointed at
 * the new address when it changed. Null: no link yet.
 */
async function syncLink(input: {
  actorId: string;
  linkId: string | null;
  body: PosterBody;
}): Promise<string | null> {
  const { body } = input;
  const target = body.qrUrl ?? (body.eventId ? eventPage(body.eventId) : null);
  if (!target) {
    if (body.content.qrEnabled) refuse(400, 'qrUrlNeeded');
    return input.linkId;
  }
  if (input.linkId) {
    const [link] = await db
      .select({ destinationUrl: shortLink.destinationUrl })
      .from(shortLink)
      .where(eq(shortLink.id, input.linkId));
    if (link && link.destinationUrl !== target) {
      await shortLinkService.update({
        actorId: input.actorId,
        id: input.linkId,
        patch: { destinationUrl: target },
      });
    }
    if (link) return input.linkId;
  }
  if (!body.content.qrEnabled) return null;
  const { id } = await shortLinkService.create({
    actorId: input.actorId,
    body: {
      shortId: body.qrShortId ?? '',
      name: `Poster: ${body.name}`.slice(0, 80),
      destinationUrl: target,
      access: 'any',
      tenantIds: [],
      recordClicks: false,
      enabled: true,
    },
  });
  return id;
}

/** The stored columns of a body. A treatment only goes with Art title. */
function columns(body: PosterBody) {
  return {
    name: body.name,
    eventId: body.eventId,
    template: body.template,
    treatment: body.template === 'artTitle' ? body.treatment : null,
    locale: body.locale,
    overrides: body.overrides,
    content: body.content,
  };
}

async function create(input: { actorId: string; body: PosterBody }): Promise<{ id: string }> {
  await checkEvent(input.body.eventId);
  const shortLinkId = await syncLink({ actorId: input.actorId, linkId: null, body: input.body });
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(poster)
      .values({
        ...columns(input.body),
        shortLinkId,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      })
      .returning();
    await adminAuditService.record(tx, {
      action: 'poster.create',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { id: row!.id, name: row!.name },
    });
    return { id: row!.id };
  });
}

async function update(input: { actorId: string; id: string; body: PosterBody }): Promise<void> {
  const [current] = await db.select().from(poster).where(eq(poster.id, input.id));
  if (!current) refuse(404, 'posterNotFound');
  await checkEvent(input.body.eventId);
  const shortLinkId = await syncLink({
    actorId: input.actorId,
    linkId: current.shortLinkId,
    body: input.body,
  });
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(poster)
      .set({ ...columns(input.body), shortLinkId, updatedBy: input.actorId })
      .where(eq(poster.id, input.id))
      .returning();
    if (!row) refuse(404, 'posterNotFound');
    await adminAuditService.record(tx, {
      action: 'poster.update',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { id: row.id, name: row.name },
    });
  });
}

/** A copy under a new name. It shares the short link, so both print the same QR code. */
async function duplicate(input: {
  actorId: string;
  id: string;
  body: { name: string };
}): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [source] = await tx.select().from(poster).where(eq(poster.id, input.id));
    if (!source) refuse(404, 'posterNotFound');
    const { id: _id, createdAt: _c, updatedAt: _u, ...copy } = source;
    const [row] = await tx
      .insert(poster)
      .values({
        ...copy,
        name: input.body.name,
        createdBy: input.actorId,
        updatedBy: input.actorId,
      })
      .returning();
    await adminAuditService.record(tx, {
      action: 'poster.create',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { id: row!.id, name: row!.name, from: source.id },
    });
    return { id: row!.id };
  });
}

/** Deletes the poster. Its short link stays: printed copies keep working. */
async function remove(input: { actorId: string; id: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx.delete(poster).where(eq(poster.id, input.id)).returning();
    if (!row) refuse(404, 'posterNotFound');
    await adminAuditService.record(tx, {
      action: 'poster.delete',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { id: row.id, name: row.name },
    });
  });
}

/**
 * Before an event is deleted: writes what each of its posters shows into its overrides, so the
 * poster keeps showing it, now standalone.
 */
async function freezeForEvent(tx: Tx, eventId: string): Promise<void> {
  const info = (await eventInfo([eventId], tx)).get(eventId);
  if (!info) return;
  const rows = await tx.select().from(poster).where(eq(poster.eventId, eventId));
  for (const row of rows) {
    const { fields } = resolvePoster(row.overrides, info.source, row.locale as PosterLocale);
    await tx.update(poster).set({ overrides: fields, eventId: null }).where(eq(poster.id, row.id));
  }
}

export const posterService = {
  list,
  get,
  events,
  create,
  update,
  duplicate,
  remove,
  freezeForEvent,
};
