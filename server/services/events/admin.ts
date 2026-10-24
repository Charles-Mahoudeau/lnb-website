import { and, asc, desc, eq, gte, isNull, lt } from 'drizzle-orm';

import { db } from '~~/server/db';
import type { Tx } from '~~/server/db';
import { event, eventRegistration, eventRoom, eventType } from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';
import { posterService } from '~~/server/services/posters';

import { bdeSyncService } from './bde';
import { eventImageService } from './images';
import { eventPushService } from './push';
import { eventRegistrationService } from './registrations';
import { roomView } from './rooms';
import { shiftDate } from './rules';
import { refuse } from './shared';
import { typeView } from './types';
import { eventImages, mediaUrl, selectEvents } from './views';
import type { SelectedEvent } from './views';

import type {
  EventAdminRow,
  EventAdminView,
  EventBody,
  EventDuplicateBody,
} from '#shared/schemas/events';
import { DEFAULT_REMINDER_OFFSETS } from '#shared/schemas/push';

// Events, for events managers: the admin list, and creating, editing, cancelling, deleting and
// duplicating events. Every change is written to admin_audit. See docs/events.md.

type EventRow = typeof event.$inferSelect;

function adminRow(row: SelectedEvent): EventAdminRow {
  return {
    id: row.event.id,
    name: row.event.name,
    startsAt: row.event.startsAt.toISOString(),
    endsAt: row.event.endsAt.toISOString(),
    hidden: row.event.hidden,
    cancelledAt: row.event.cancelledAt?.toISOString() ?? null,
    room: roomView(row.room),
    type: typeView(row.type),
    capacity: row.event.capacity,
    counts: { registered: row.registered, waitlist: row.waitlist },
    bdeSync: row.event.bdeSync,
    bdeStatus: row.event.bdeStatus,
  };
}

function adminView(row: SelectedEvent): EventAdminView {
  const e = row.event;
  return {
    ...adminRow(row),
    description: e.description,
    banner: e.bannerKey
      ? {
          key: e.bannerKey,
          focusX: e.bannerFocusX,
          focusY: e.bannerFocusY,
          url: mediaUrl(e.bannerKey),
        }
      : null,
    embed: e.embedKey
      ? { key: e.embedKey, focusX: e.embedFocusX, focusY: e.embedFocusY, url: mediaUrl(e.embedKey) }
      : null,
    images: eventImages(e),
    schools: e.schools,
    registrationOpensAt: e.registrationOpensAt?.toISOString() ?? null,
    registrationClosesAt: e.registrationClosesAt?.toISOString() ?? null,
    price: e.price,
    reminderOffsets: e.reminderOffsets,
    announcedAt: e.announcedAt?.toISOString() ?? null,
    bde: {
      attempts: e.bdeAttempts,
      nextAttemptAt: e.bdeNextAttemptAt?.toISOString() ?? null,
      lastError: e.bdeLastError,
      pageUrl: e.bdePageUrl,
    },
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
  };
}

/** One tab of the admin list. Upcoming soonest first, past and drafts latest first. */
async function list(query: { tab: 'upcoming' | 'drafts' | 'past' }): Promise<EventAdminRow[]> {
  const now = new Date();
  const base = selectEvents();
  const rows =
    query.tab === 'drafts'
      ? await base.where(eq(event.hidden, true)).orderBy(desc(event.startsAt))
      : query.tab === 'upcoming'
        ? await base
            .where(and(eq(event.hidden, false), gte(event.endsAt, now)))
            .orderBy(asc(event.startsAt))
        : await base
            .where(and(eq(event.hidden, false), lt(event.endsAt, now)))
            .orderBy(desc(event.startsAt))
            .limit(200);
  return rows.map(adminRow);
}

async function get(id: string): Promise<EventAdminView> {
  const [row] = await selectEvents().where(eq(event.id, id));
  if (!row) refuse(404, 'notFound');
  return adminView(row);
}

/** The room and type an event points to must exist. Archived ones are refused on new choices. */
async function checkChoices(
  tx: Tx,
  body: { roomId: string; typeId: string },
  current?: EventRow,
): Promise<{ roomName: string }> {
  const [room] = await tx.select().from(eventRoom).where(eq(eventRoom.id, body.roomId));
  if (!room || (room.archivedAt && room.id !== current?.roomId)) refuse(400, 'roomNotFound');
  const [type] = await tx.select().from(eventType).where(eq(eventType.id, body.typeId));
  if (!type || (type.archivedAt && type.id !== current?.typeId)) refuse(400, 'typeNotFound');
  return { roomName: room.name };
}

/**
 * The image columns: the picked originals and focal points, and the crops made from them. Run
 * before the transaction, since cropping takes a moment. A missing original is refused.
 */
async function imageColumns(body: EventBody) {
  const banner = body.banner ?? null;
  const embed = banner ? (body.embed ?? null) : null;
  if (!banner) {
    return {
      bannerKey: null,
      embedKey: null,
      bannerCropKey: null,
      thumbCropKey: null,
      embedCropKey: null,
    };
  }
  for (const image of [banner, embed]) {
    if (image && !(await eventImageService.exists(image.key))) refuse(400, 'imageNotFound');
  }
  return {
    bannerKey: banner.key,
    bannerFocusX: banner.focusX,
    bannerFocusY: banner.focusY,
    embedKey: embed?.key ?? null,
    embedFocusX: embed?.focusX ?? 0.5,
    embedFocusY: embed?.focusY ?? 0.5,
    ...(await eventImageService.crops(banner, embed)),
  };
}

function columns(body: EventBody) {
  const date = (iso: string) => new Date(iso);
  const optionalDate = (iso: string | null) => (iso ? new Date(iso) : null);
  return {
    name: body.name,
    description: body.description,
    roomId: body.roomId,
    typeId: body.typeId,
    schools: body.schools,
    startsAt: date(body.startsAt),
    endsAt: date(body.endsAt),
    capacity: body.capacity,
    registrationOpensAt: optionalDate(body.registrationOpensAt),
    registrationClosesAt: optionalDate(body.registrationClosesAt),
    price: body.price,
    hidden: body.hidden,
    reminderOffsets: [...(body.reminderOffsets ?? DEFAULT_REMINDER_OFFSETS)].sort((a, b) => b - a),
    bdeSync: body.bdeSync,
  };
}

async function create(input: { actorId: string; body: EventBody }): Promise<{ id: string }> {
  const images = await imageColumns(input.body);
  const created = await db.transaction(async (tx) => {
    await checkChoices(tx, input.body);
    const [row] = await tx
      .insert(event)
      .values({ ...columns(input.body), ...images, createdByUserId: input.actorId })
      .returning({ id: event.id, name: event.name });
    await adminAuditService.record(tx, {
      action: 'event.create',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { eventId: row!.id, name: row!.name },
    });
    await bdeSyncService.markPending(tx, row!.id);
    return { id: row!.id };
  });
  await bdeSyncService.sync(created.id);
  return created;
}

async function lockEvent(tx: Tx, id: string): Promise<EventRow> {
  const [row] = await tx.select().from(event).where(eq(event.id, id)).for('update');
  if (!row) refuse(404, 'notFound');
  return row;
}

/** Replaces the whole event. A cancelled event can't be edited. */
async function update(input: { actorId: string; id: string; body: EventBody }): Promise<void> {
  const images = await imageColumns(input.body);
  await db.transaction(async (tx) => {
    const current = await lockEvent(tx, input.id);
    if (current.cancelledAt) refuse(409, 'cancelled');
    await checkChoices(tx, input.body, current);
    const cols = columns(input.body);
    await tx
      .update(event)
      .set({ ...cols, ...images })
      .where(eq(event.id, input.id));
    // A new start time tells everyone on the event, and the old reminders are dropped.
    await eventPushService.onRescheduled(tx, current, cols.startsAt);
    // More places, or no limit any more: the waitlist moves up at once.
    await eventRegistrationService.promoteAfterChange(tx, input.id);
    await adminAuditService.record(tx, {
      action: 'event.update',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { eventId: input.id, name: input.body.name },
    });
    await bdeSyncService.markPending(tx, input.id);
  });
  await bdeSyncService.sync(input.id);
}

/** Cancels the event: its page stays, with registrations closed. It can't be undone. */
async function cancel(input: { actorId: string; id: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const [row] = await tx
      .update(event)
      .set({ cancelledAt: new Date() })
      .where(and(eq(event.id, input.id), isNull(event.cancelledAt)))
      .returning({ id: event.id, name: event.name });
    if (!row) {
      await lockEvent(tx, input.id);
      refuse(409, 'cancelled');
    }
    await adminAuditService.record(tx, {
      action: 'event.cancel',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { eventId: row.id, name: row.name },
    });
    await eventPushService.onCancelled(tx, row.id);
    // A cancelled event comes down from the BDE website.
    await bdeSyncService.markPending(tx, row.id);
  });
  await bdeSyncService.sync(input.id);
}

/** Deletes a draft, or an event nobody registered to. Others are cancelled instead. */
async function remove(input: { actorId: string; id: string }): Promise<void> {
  await db.transaction(async (tx) => {
    const current = await lockEvent(tx, input.id);
    if (!current.hidden) {
      const [registration] = await tx
        .select({ id: eventRegistration.id })
        .from(eventRegistration)
        .where(eq(eventRegistration.eventId, input.id))
        .limit(1);
      if (registration) refuse(409, 'hasRegistrations');
    }
    await bdeSyncService.removeBeforeDelete(current);
    await posterService.freezeForEvent(tx, input.id);
    await tx.delete(event).where(eq(event.id, input.id));
    await adminAuditService.record(tx, {
      action: 'event.delete',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { eventId: input.id, name: current.name },
    });
  });
}

/** A draft copy at new dates. The registration window moves with the start. */
async function duplicate(input: {
  actorId: string;
  id: string;
  body: EventDuplicateBody;
}): Promise<{ id: string }> {
  return db.transaction(async (tx) => {
    const [source] = await tx.select().from(event).where(eq(event.id, input.id));
    if (!source) refuse(404, 'notFound');
    const startsAt = new Date(input.body.startsAt);
    const [row] = await tx
      .insert(event)
      .values({
        name: source.name,
        description: source.description,
        roomId: source.roomId,
        typeId: source.typeId,
        schools: source.schools,
        startsAt,
        endsAt: new Date(input.body.endsAt),
        capacity: source.capacity,
        registrationOpensAt: shiftDate(source.registrationOpensAt, source.startsAt, startsAt),
        registrationClosesAt: shiftDate(source.registrationClosesAt, source.startsAt, startsAt),
        price: source.price,
        reminderOffsets: source.reminderOffsets,
        hidden: true,
        bannerKey: source.bannerKey,
        bannerFocusX: source.bannerFocusX,
        bannerFocusY: source.bannerFocusY,
        embedKey: source.embedKey,
        embedFocusX: source.embedFocusX,
        embedFocusY: source.embedFocusY,
        bannerCropKey: source.bannerCropKey,
        thumbCropKey: source.thumbCropKey,
        embedCropKey: source.embedCropKey,
        bdeSync: source.bdeSync,
        createdByUserId: input.actorId,
      })
      .returning({ id: event.id });
    await adminAuditService.record(tx, {
      action: 'event.create',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { eventId: row!.id, name: source.name, duplicateOf: source.id },
    });
    await bdeSyncService.markPending(tx, row!.id);
    return { id: row!.id };
  });
}

export const eventAdminService = { list, get, create, update, cancel, remove, duplicate };
