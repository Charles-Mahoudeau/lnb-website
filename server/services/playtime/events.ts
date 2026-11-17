import { eq } from 'drizzle-orm';

import type { Db, Tx } from '~~/server/db';
import { playtimeClosure } from '~~/server/db/schema';

import type { PlaytimeEventScope } from '#shared/schemas/playtime';
import { parisDate } from '#shared/utils/paris-time';

// Event mode: an event can switch the limit off for its days. It is a closure tied to the event
// (`playtime_closure.event_id`), kept in step by the events service and never edited by hand. See
// docs/playtime.md.

interface EventDays {
  id: string;
  name: string;
  startsAt: Date;
  endsAt: Date;
}

/** What the event's form shows: the scope of its closure, or null when it has none. */
async function scopeOf(tx: Db, eventId: string): Promise<PlaytimeEventScope | null> {
  const [row] = await tx
    .select({ scope: playtimeClosure.eventScope })
    .from(playtimeClosure)
    .where(eq(playtimeClosure.eventId, eventId));
  return row?.scope ?? null;
}

/** Removes the event's closure. Deleting the event does it too, through the foreign key. */
async function clear(tx: Tx, eventId: string): Promise<void> {
  await tx.delete(playtimeClosure).where(eq(playtimeClosure.eventId, eventId));
}

/**
 * Makes the event's closure match: created or moved with the event, named after it, removed when
 * the switch is off. It covers the Paris days from the start to the end, both inclusive, because
 * a closure is made of whole days. A draft keeps its closure but it doesn't apply until the event
 * is published (`closureAppliesTo`). The caller holds the event's row lock.
 */
async function sync(tx: Tx, e: EventDays, scope: PlaytimeEventScope | null): Promise<void> {
  if (!scope) {
    await clear(tx, e.id);
    return;
  }
  const values = {
    label: e.name,
    startsOn: parisDate(e.startsAt.getTime()),
    // An event ending exactly at midnight doesn't close the next day.
    endsOn: parisDate(e.endsAt.getTime() - 1),
    tenantIds: null,
    eventScope: scope,
  };
  const updated = await tx
    .update(playtimeClosure)
    .set(values)
    .where(eq(playtimeClosure.eventId, e.id))
    .returning({ id: playtimeClosure.id });
  if (updated.length === 0) await tx.insert(playtimeClosure).values({ ...values, eventId: e.id });
}

export const playtimeEventService = { scopeOf, sync, clear };
