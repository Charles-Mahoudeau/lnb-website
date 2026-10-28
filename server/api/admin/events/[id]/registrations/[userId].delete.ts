import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventRegistrationService } from '~~/server/services/events/registrations';

import { eventRegistrationParams } from '#shared/schemas/events';

export default defineEventHandler(async (event) => {
  const actor = await requireAccess(event, {
    permission: 'registrations:write',
    user: requireEventsManager,
  });
  const { id, userId } = parseParams(event, eventRegistrationParams);
  await eventRegistrationService.remove({
    actorId: actorUserId(actor),
    actorData: actorAuditData(actor),
    eventId: id,
    userId,
  });
  setResponseStatus(event, 204);
  return null;
});
