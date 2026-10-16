import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventRegistrationService } from '~~/server/services/events/registrations';

import { eventRegistrationParams } from '#shared/schemas/events';

export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { id, userId } = parseParams(event, eventRegistrationParams);
  await eventRegistrationService.remove({ actorId: manager.id, eventId: id, userId });
  setResponseStatus(event, 204);
  return null;
});
