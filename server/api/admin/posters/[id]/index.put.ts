import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { posterService } from '~~/server/services/posters';

import { posterBody, posterIdParams } from '#shared/schemas/posters';

export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { id } = parseParams(event, posterIdParams);
  const body = await parseBody(event, posterBody);
  await posterService.update({ actorId: manager.id, id, body });
  setResponseStatus(event, 204);
  return null;
});
