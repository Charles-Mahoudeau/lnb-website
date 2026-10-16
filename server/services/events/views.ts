import { eq, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import { event, eventRegistration, eventRoom, eventType } from '~~/server/db/schema';

import type { EventSummary } from '#shared/schemas/events';

// The query and mapping every events view shares: an event with its room, its type and its
// registration counts.

export const registeredCount = sql<number>`(
  select count(*)::int from ${eventRegistration}
  where ${eventRegistration.eventId} = ${event.id} and ${eventRegistration.status} = 'registered'
)`;
export const waitlistCount = sql<number>`(
  select count(*)::int from ${eventRegistration}
  where ${eventRegistration.eventId} = ${event.id} and ${eventRegistration.status} = 'waitlist'
)`;

export function selectEvents() {
  return db
    .select({
      event,
      room: eventRoom,
      type: eventType,
      registered: registeredCount,
      waitlist: waitlistCount,
    })
    .from(event)
    .innerJoin(eventRoom, eq(eventRoom.id, event.roomId))
    .innerJoin(eventType, eq(eventType.id, event.typeId));
}

export type SelectedEvent = Awaited<ReturnType<typeof selectEvents>>[number];

/** Where the page loads an image of the events storage from. */
export function mediaUrl(key: string): string {
  return `/api/media/${key}`;
}

export function eventImages(row: typeof event.$inferSelect): EventSummary['images'] {
  if (!row.bannerCropKey || !row.thumbCropKey || !row.embedCropKey) return null;
  return {
    banner: mediaUrl(row.bannerCropKey),
    thumb: mediaUrl(row.thumbCropKey),
    embed: mediaUrl(row.embedCropKey),
  };
}

export function summaryView(row: SelectedEvent, me: EventSummary['me'] = null): EventSummary {
  const e = row.event;
  return {
    id: e.id,
    name: e.name,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    cancelled: e.cancelledAt !== null,
    room: { name: row.room.name, details: row.room.details },
    type: {
      id: row.type.id,
      nameEn: row.type.nameEn,
      nameFr: row.type.nameFr,
      icon: row.type.icon,
    },
    schools: e.schools,
    capacity: e.capacity,
    registered: row.registered,
    images: eventImages(e),
    me,
  };
}
