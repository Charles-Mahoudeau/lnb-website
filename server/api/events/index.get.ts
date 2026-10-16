import { defineEventHandler } from 'nuxt/server';

import { eventPublicService } from '~~/server/services/events/public';
import { eventRegistrationService } from '~~/server/services/events/registrations';

import { eventQuery } from '#shared/schemas/events';

export default defineEventHandler(async (event) => {
  await requireFlag(event, 'events');
  const query = parseQuery(event, eventQuery);
  const userId = (await getAuthSession(event))?.user.id ?? null;
  const items = await eventPublicService.list(query, { userId });
  if (query.attendees !== 'next') return { items };
  // Names are for members only, as on the event page.
  const next = items[0];
  return {
    items,
    nextAttendees: userId && next ? await eventRegistrationService.attendees(next.id) : null,
  };
});
