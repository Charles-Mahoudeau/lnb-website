import { and, eq, isNull, or, sql } from 'drizzle-orm';
import type { SQL } from 'drizzle-orm';

import { event, eventRegistration, playtimeClosure } from '~~/server/db/schema';

/**
 * The closures that apply to one player: for their school, and for an event, only once the event
 * is published and, when it is for registered players, only if they hold a place (not a waitlist
 * spot). A registration change therefore takes effect on the next read, with nothing to sync.
 */
export function closureAppliesTo(tenantId: string, userId: string): SQL {
  return and(
    or(isNull(playtimeClosure.tenantIds), sql`${tenantId} = ANY(${playtimeClosure.tenantIds})`),
    or(
      isNull(playtimeClosure.eventId),
      and(
        sql`exists (select 1 from ${event} where ${event.id} = ${playtimeClosure.eventId} and not ${event.hidden} and ${event.cancelledAt} is null)`,
        or(
          eq(playtimeClosure.eventScope, 'everyone'),
          sql`exists (select 1 from ${eventRegistration} where ${eventRegistration.eventId} = ${playtimeClosure.eventId} and ${eventRegistration.userId} = ${userId} and ${eventRegistration.status} = 'registered')`,
        ),
      ),
    ),
  )!;
}
