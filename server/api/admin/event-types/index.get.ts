import { defineEventHandler } from 'nuxt/server';

import { eventTypeService } from '~~/server/services/events/types';

export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  return { items: await eventTypeService.list() };
});
