import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventTypeService } from '~~/server/services/events/types';

import { eventTypeBody } from '#shared/schemas/events';

export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const body = await parseBody(event, eventTypeBody);
  const type = await eventTypeService.create({ actorId: manager.id, body });
  setResponseStatus(event, 201);
  return type;
});
