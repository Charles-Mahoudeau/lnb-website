import { defineEventHandler } from 'nuxt/server';

import { posterService } from '~~/server/services/posters';

import { posterIdParams } from '#shared/schemas/posters';

export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  const { id } = parseParams(event, posterIdParams);
  return posterService.get(id);
});
