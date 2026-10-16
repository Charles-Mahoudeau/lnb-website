import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventAdminService } from '~~/server/services/events/admin';

import { eventBody } from '#shared/schemas/events';

export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const body = await parseBody(event, eventBody);
  const created = await eventAdminService.create({ actorId: manager.id, body });
  setResponseStatus(event, 201);
  return created;
});
