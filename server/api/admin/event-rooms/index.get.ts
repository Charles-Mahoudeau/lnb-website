import { defineEventHandler } from 'nuxt/server';

import { eventRoomService } from '~~/server/services/events/rooms';

export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  return { items: await eventRoomService.list() };
});
