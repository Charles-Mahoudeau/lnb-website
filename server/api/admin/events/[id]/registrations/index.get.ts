import { defineEventHandler } from 'nuxt/server';

import { eventRegistrationService } from '~~/server/services/events/registrations';

import { eventIdParams } from '#shared/schemas/events';

export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  const { id } = parseParams(event, eventIdParams);
  return { items: await eventRegistrationService.list(id) };
});
