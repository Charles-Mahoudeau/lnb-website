import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventRegistrationService } from '~~/server/services/events/registrations';

import { eventIdParams, eventRegistrationAddBody } from '#shared/schemas/events';

export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { id } = parseParams(event, eventIdParams);
  const body = await parseBody(event, eventRegistrationAddBody);
  await eventRegistrationService.add({ actorId: manager.id, eventId: id, ...body });
  setResponseStatus(event, 204);
  return null;
});
