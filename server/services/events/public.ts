import { and, asc, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';

import { db } from '~~/server/db';
import { event, eventRegistration } from '~~/server/db/schema';
import { siteUrl } from '~~/server/lib/site';

import { descriptionSummary, descriptionText, renderDescription } from './markdown';
import { eventRegistrationService } from './registrations';
import { buildIcs, registrationState } from './rules';
import { refuse } from './shared';
import { selectEvents, summaryView } from './views';
import type { SelectedEvent } from './views';

import type { EventSummary, EventView, MyEventList } from '#shared/schemas/events';

// Events as everyone sees them: the list, an event's page and its calendar file. Drafts are
// for events managers only: everyone else gets a 404, as if they didn't exist.

/** Who's asking: signed in or not, and whether they may see drafts. */
export interface Viewer {
  userId: string | null;
  tenantId: string | null;
  canSeeDrafts: boolean;
}

/** The viewer's status on each of these events. */
async function statuses(eventIds: string[], userId: string | null) {
  if (!userId || eventIds.length === 0) return new Map<string, EventSummary['me']>();
  const rows = await db
    .select({ eventId: eventRegistration.eventId, status: eventRegistration.status })
    .from(eventRegistration)
    .where(and(eq(eventRegistration.userId, userId), inArray(eventRegistration.eventId, eventIds)));
  return new Map(rows.map((row) => [row.eventId, row.status]));
}

async function list(
  query: { when: 'upcoming' | 'past'; type?: string; school?: string; limit: number },
  viewer: Pick<Viewer, 'userId'>,
): Promise<EventSummary[]> {
  const now = new Date();
  const rows = await selectEvents()
    .where(
      and(
        eq(event.hidden, false),
        query.when === 'upcoming' ? gte(event.endsAt, now) : lt(event.endsAt, now),
        query.type ? eq(event.typeId, query.type) : undefined,
        query.school ? sql`${query.school} = any(${event.schools})` : undefined,
      ),
    )
    .orderBy(query.when === 'upcoming' ? asc(event.startsAt) : desc(event.startsAt))
    .limit(query.limit);
  const mine = await statuses(
    rows.map((row) => row.event.id),
    viewer.userId,
  );
  return rows.map((row) => summaryView(row, mine.get(row.event.id) ?? null));
}

/** The events the viewer registered to, or waits for. Not drafts: their pages are closed. */
async function mine(userId: string): Promise<MyEventList> {
  const now = new Date();
  const registrations = await db
    .select({ eventId: eventRegistration.eventId, status: eventRegistration.status })
    .from(eventRegistration)
    .where(eq(eventRegistration.userId, userId));
  const status = new Map(registrations.map((r) => [r.eventId, r.status]));
  const rows = status.size
    ? await selectEvents()
        .where(and(inArray(event.id, [...status.keys()]), eq(event.hidden, false)))
        .orderBy(asc(event.startsAt))
    : [];
  const view = (row: (typeof rows)[number]) => summaryView(row, status.get(row.event.id) ?? null);
  return {
    upcoming: rows.filter((row) => row.event.endsAt >= now).map(view),
    past: rows
      .filter((row) => row.event.endsAt < now)
      .reverse()
      .slice(0, 50)
      .map(view),
  };
}

async function find(id: string, canSeeDrafts: boolean): Promise<SelectedEvent> {
  const [row] = await selectEvents().where(eq(event.id, id));
  if (!row || (row.event.hidden && !canSeeDrafts)) refuse(404, 'notFound');
  return row;
}

async function get(id: string, viewer: Viewer): Promise<EventView> {
  const row = await find(id, viewer.canSeeDrafts);
  const e = row.event;
  const me = viewer.userId ? await eventRegistrationService.standing(e.id, viewer.userId) : null;
  const people = viewer.userId ? await eventRegistrationService.attendees(e.id) : null;
  return {
    ...summaryView(row, me?.status ?? null),
    descriptionHtml: renderDescription(e.description),
    summary: descriptionSummary(e.description),
    price: e.price,
    registrationOpensAt: e.registrationOpensAt?.toISOString() ?? null,
    registrationClosesAt: e.registrationClosesAt?.toISOString() ?? null,
    hidden: e.hidden,
    registration: {
      state: registrationState({ ...e, registered: row.registered }, viewer.tenantId),
      waitlist: row.waitlist,
      me,
    },
    attendees: people,
  };
}

/** The event as an .ics file, for "Add to calendar". */
async function calendar(id: string, canSeeDrafts: boolean): Promise<string> {
  const row = await find(id, canSeeDrafts);
  const e = row.event;
  return buildIcs({
    id: e.id,
    name: e.name,
    description: descriptionText(e.description),
    location: row.room.details ? `${row.room.name}, ${row.room.details}` : row.room.name,
    startsAt: e.startsAt,
    endsAt: e.endsAt,
    url: siteUrl(`/events/${e.id}`),
    cancelled: e.cancelledAt !== null,
    updatedAt: e.updatedAt,
  });
}

export const eventPublicService = { list, mine, get, calendar };
