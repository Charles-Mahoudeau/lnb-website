import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventAdminService } from '~~/server/services/events/admin';

import { eventBody, eventIdParams } from '#shared/schemas/events';

export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { id } = parseParams(event, eventIdParams);
  const body = await parseBody(event, eventBody);
  await eventAdminService.update({ actorId: manager.id, id, body });
  setResponseStatus(event, 204);
  return null;
});
