import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventAdminService } from '~~/server/services/events/admin';

import { eventBody, eventIdParams, eventSaveQuery } from '#shared/schemas/events';

export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { id } = parseParams(event, eventIdParams);
  const body = await parseBody(event, eventBody);
  const { silent } = parseQuery(event, eventSaveQuery);
  await eventAdminService.update({ actorId: manager.id, id, body, silent });
  setResponseStatus(event, 204);
  return null;
});
