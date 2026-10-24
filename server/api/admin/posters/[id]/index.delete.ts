import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { posterService } from '~~/server/services/posters';

import { posterIdParams } from '#shared/schemas/posters';

export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { id } = parseParams(event, posterIdParams);
  await posterService.remove({ actorId: manager.id, id });
  setResponseStatus(event, 204);
  return null;
});
