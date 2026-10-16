import { defineEventHandler } from 'nuxt/server';

import { eventRegistrationService } from '~~/server/services/events/registrations';

import { eventUserQuery } from '#shared/schemas/events';

export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  const { q } = parseQuery(event, eventUserQuery);
  return { items: await eventRegistrationService.searchUsers(q) };
});
