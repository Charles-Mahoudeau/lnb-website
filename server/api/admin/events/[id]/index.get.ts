import { defineEventHandler } from 'nuxt/server';

import { eventAdminService } from '~~/server/services/events/admin';

import { eventIdParams } from '#shared/schemas/events';

export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  const { id } = parseParams(event, eventIdParams);
  return eventAdminService.get(id);
});
