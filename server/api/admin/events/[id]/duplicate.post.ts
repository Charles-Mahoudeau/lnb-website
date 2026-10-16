import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventAdminService } from '~~/server/services/events/admin';

import { eventDuplicateBody, eventIdParams } from '#shared/schemas/events';

export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { id } = parseParams(event, eventIdParams);
  const body = await parseBody(event, eventDuplicateBody);
  const created = await eventAdminService.duplicate({ actorId: manager.id, id, body });
  setResponseStatus(event, 201);
  return created;
});
