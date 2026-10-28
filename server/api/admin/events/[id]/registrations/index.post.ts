import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventRegistrationService } from '~~/server/services/events/registrations';

import { eventIdParams, eventRegistrationAddBody } from '#shared/schemas/events';

export default defineEventHandler(async (event) => {
  const actor = await requireAccess(event, {
    permission: 'registrations:write',
    user: requireEventsManager,
  });
  const { id } = parseParams(event, eventIdParams);
  const body = await parseBody(event, eventRegistrationAddBody);
  await eventRegistrationService.add({
    ...body,
    // A key never goes past the limit: only a person can decide to.
    force: actor.kind === 'user' && body.force,
    actorId: actorUserId(actor),
    actorData: actorAuditData(actor),
    eventId: id,
  });
  setResponseStatus(event, 204);
  return null;
});
