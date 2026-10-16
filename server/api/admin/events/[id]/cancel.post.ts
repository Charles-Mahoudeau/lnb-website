import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventAdminService } from '~~/server/services/events/admin';

import { eventIdParams } from '#shared/schemas/events';

export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { id } = parseParams(event, eventIdParams);
  await eventAdminService.cancel({ actorId: manager.id, id });
  setResponseStatus(event, 204);
  return null;
});
