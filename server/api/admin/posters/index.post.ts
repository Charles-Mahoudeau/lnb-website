import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { posterService } from '~~/server/services/posters';

import { posterBody } from '#shared/schemas/posters';

export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const body = await parseBody(event, posterBody);
  const created = await posterService.create({ actorId: manager.id, body });
  setResponseStatus(event, 201);
  return created;
});
