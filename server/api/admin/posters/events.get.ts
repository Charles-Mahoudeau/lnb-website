import { defineEventHandler } from 'nuxt/server';

import { posterService } from '~~/server/services/posters';

export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  return { items: await posterService.events() };
});
