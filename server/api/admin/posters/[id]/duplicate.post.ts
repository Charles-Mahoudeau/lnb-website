import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { posterService } from '~~/server/services/posters';

import { posterDuplicateBody, posterIdParams } from '#shared/schemas/posters';

export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { id } = parseParams(event, posterIdParams);
  const body = await parseBody(event, posterDuplicateBody);
  const created = await posterService.duplicate({ actorId: manager.id, id, body });
  setResponseStatus(event, 201);
  return created;
});
