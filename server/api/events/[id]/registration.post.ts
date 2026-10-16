import { defineEventHandler } from 'nuxt/server';

import { eventRegistrationService } from '~~/server/services/events/registrations';

import { eventIdParams } from '#shared/schemas/events';

// Registers the caller, or puts them on the waitlist. Registering twice changes nothing.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'events.registration');
  const { id } = parseParams(event, eventIdParams);
  return eventRegistrationService.register({
    userId: user.id,
    tenantId: user.tenantId,
    eventId: id,
  });
});
