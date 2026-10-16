import { and, asc, desc, eq, gte, lt, sql } from 'drizzle-orm';

import { event } from '~~/server/db/schema';
import { siteUrl } from '~~/server/lib/site';

import { descriptionSummary, descriptionText, renderDescription } from './markdown';
import { buildIcs } from './rules';
import { refuse } from './shared';
import { selectEvents, summaryView } from './views';
import type { SelectedEvent } from './views';

import type { EventSummary, EventView } from '#shared/schemas/events';

// Events as everyone sees them: the list, an event's page and its calendar file. Drafts are
// for events managers only: everyone else gets a 404, as if they didn't exist.

async function list(query: {
  when: 'upcoming' | 'past';
  type?: string;
  school?: string;
  limit: number;
}): Promise<EventSummary[]> {
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
  return rows.map(summaryView);
}

async function find(id: string, canSeeDrafts: boolean): Promise<SelectedEvent> {
  const [row] = await selectEvents().where(eq(event.id, id));
  if (!row || (row.event.hidden && !canSeeDrafts)) refuse(404, 'notFound');
  return row;
}

async function get(id: string, canSeeDrafts: boolean): Promise<EventView> {
  const row = await find(id, canSeeDrafts);
  const e = row.event;
  return {
    ...summaryView(row),
    descriptionHtml: renderDescription(e.description),
    summary: descriptionSummary(e.description),
    price: e.price,
    registrationOpensAt: e.registrationOpensAt?.toISOString() ?? null,
    registrationClosesAt: e.registrationClosesAt?.toISOString() ?? null,
    hidden: e.hidden,
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

export const eventPublicService = { list, get, calendar };
