import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventRegistrationService } from '~~/server/services/events/registrations';

import { eventIdParams } from '#shared/schemas/events';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'events.registration');
  const { id } = parseParams(event, eventIdParams);
  await eventRegistrationService.unregister({ userId: user.id, eventId: id });
  setResponseStatus(event, 204);
  return null;
});
