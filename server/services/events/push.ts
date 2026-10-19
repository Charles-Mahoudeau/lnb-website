import { and, asc, count, eq, inArray, isNull, or } from 'drizzle-orm';

import { db } from '~~/server/db';
import type { Tx } from '~~/server/db';
import { event, eventRegistration, eventRoom, user } from '~~/server/db/schema';
import type { PushKind } from '~~/server/db/schema';
import { adminAuditService } from '~~/server/services/admin-audit';
import { buildMessage } from '~~/server/services/push/messages';
import { pushQueueService } from '~~/server/services/push/queue';

import { placesToPromote } from './rules';
import { refuse } from './shared';

import type { PushImpactBody, PushImpactView } from '#shared/schemas/push';

// Where events meet push: who an action would notify (for the manager's confirmation), the
// new-event announcement, and the notifications for a cancelled or moved event.

type EventRow = typeof event.$inferSelect;

async function getEvent(dbx: Tx | typeof db, id: string): Promise<EventRow> {
  const [row] = await dbx.select().from(event).where(eq(event.id, id));
  if (!row) refuse(404, 'notFound');
  return row;
}

/** Everyone on the event, registered or on the waitlist. */
async function everyone(dbx: Tx | typeof db, eventId: string): Promise<string[]> {
  const rows = await dbx
    .select({ userId: eventRegistration.userId })
    .from(eventRegistration)
    .where(eq(eventRegistration.eventId, eventId));
  return rows.map((row) => row.userId);
}

/** Accounts of the schools the event is open to, who can still sign in. */
async function inSchools(dbx: Tx | typeof db, schools: string[]): Promise<string[]> {
  const rows = await dbx
    .select({ id: user.id })
    .from(user)
    .where(and(inArray(user.tenantId, schools), or(isNull(user.banned), eq(user.banned, false))));
  return rows.map((row) => row.id);
}

/** The people who would get a place if the capacity became this. */
async function wouldBePromoted(row: EventRow, capacity: number | null): Promise<string[]> {
  const counted = await db
    .select({ status: eventRegistration.status, n: count() })
    .from(eventRegistration)
    .where(eq(eventRegistration.eventId, row.id))
    .groupBy(eventRegistration.status);
  const of = (status: 'registered' | 'waitlist') =>
    counted.find((c) => c.status === status)?.n ?? 0;
  const n = placesToPromote({
    startsAt: row.startsAt,
    capacity,
    registered: of('registered'),
    waitlist: of('waitlist'),
  });
  if (n === 0) return [];
  const next = await db
    .select({ userId: eventRegistration.userId })
    .from(eventRegistration)
    .where(and(eq(eventRegistration.eventId, row.id), eq(eventRegistration.status, 'waitlist')))
    .orderBy(asc(eventRegistration.id))
    .limit(n);
  return next.map((r) => r.userId);
}

/** What an action would send, before the manager confirms it. Nothing is written. */
async function impact(eventId: string, body: PushImpactBody): Promise<PushImpactView> {
  const row = await getEvent(db, eventId);
  const [room] = await db
    .select({ name: eventRoom.name })
    .from(eventRoom)
    .where(eq(eventRoom.id, row.roomId));
  let kind: PushKind;
  let audience: string[];
  switch (body.action) {
    case 'announce':
      kind = 'newEvent';
      audience =
        row.hidden || row.cancelledAt || row.announcedAt ? [] : await inSchools(db, row.schools);
      break;
    case 'cancel':
      kind = 'cancelled';
      audience = row.cancelledAt ? [] : await everyone(db, eventId);
      break;
    case 'reschedule':
      kind = 'rescheduled';
      audience = await everyone(db, eventId);
      break;
    case 'capacity':
      kind = 'spot';
      audience = await wouldBePromoted(row, body.capacity);
      break;
    case 'add':
      kind = 'spot';
      audience = [body.userId];
      break;
  }
  const startsAt =
    body.action === 'reschedule' && body.startsAt ? new Date(body.startsAt) : row.startsAt;
  const message = buildMessage(
    kind,
    body.locale ?? 'en',
    { id: row.id, name: row.name, startsAt, room: room?.name ?? '' },
    { offset: row.reminderOffsets[0] },
  );
  return {
    ...(await pushQueueService.impact(kind, audience)),
    preview: { title: message.title, body: message.body },
  };
}

/** Sends the new-event notification, once, to followers in the schools the event is open to. */
async function announce(input: { actorId: string; id: string }): Promise<{ recipients: number }> {
  return db.transaction(async (tx) => {
    const [row] = await tx.select().from(event).where(eq(event.id, input.id)).for('update');
    if (!row) refuse(404, 'notFound');
    if (row.hidden || row.cancelledAt || row.startsAt <= new Date()) refuse(409, 'notAnnounceable');
    if (row.announcedAt) refuse(409, 'alreadyAnnounced');
    await tx.update(event).set({ announcedAt: new Date() }).where(eq(event.id, row.id));
    const recipients = await pushQueueService.enqueue(tx, {
      kind: 'newEvent',
      eventId: row.id,
      userIds: await inSchools(tx, row.schools),
      dedupe: (userId) => `newEvent:${row.id}:${userId}`,
    });
    await adminAuditService.record(tx, {
      action: 'event.announce',
      actorUserId: input.actorId,
      targetUserId: null,
      data: { eventId: row.id, name: row.name, recipients },
    });
    return { recipients };
  });
}

/** In the cancelling transaction: drops what is waiting, and tells everyone on the event. */
async function onCancelled(tx: Tx, eventId: string): Promise<void> {
  await pushQueueService.dropPending(tx, eventId, ['reminder', 'spot', 'newEvent', 'rescheduled']);
  await pushQueueService.enqueue(tx, {
    kind: 'cancelled',
    eventId,
    userIds: await everyone(tx, eventId),
    dedupe: (userId) => `cancelled:${eventId}:${userId}`,
  });
}

/** In the editing transaction, when the start moved: old reminders go, everyone hears. */
async function onRescheduled(tx: Tx, row: EventRow, startsAt: Date): Promise<void> {
  if (row.hidden || row.startsAt.getTime() === startsAt.getTime()) return;
  await pushQueueService.dropPending(tx, row.id, ['reminder', 'rescheduled']);
  await pushQueueService.enqueue(tx, {
    kind: 'rescheduled',
    eventId: row.id,
    userIds: await everyone(tx, row.id),
    dedupe: (userId) => `rescheduled:${row.id}:${userId}:${String(startsAt.getTime())}`,
  });
}

export const eventPushService = { impact, announce, onCancelled, onRescheduled };
