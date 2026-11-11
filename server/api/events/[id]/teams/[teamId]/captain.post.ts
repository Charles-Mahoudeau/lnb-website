import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventTeamService } from '~~/server/services/events/teams';

import { eventTeamCaptainBody, eventTeamParams } from '#shared/schemas/event-teams';

// Hands the captain's role to another member. The captain only.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'events.registration');
  await requireFlag(event, 'events.teams');
  const { id, teamId } = parseParams(event, eventTeamParams);
  const body = await parseBody(event, eventTeamCaptainBody);
  await eventTeamService.transferCaptain({
    userId: user.id,
    eventId: id,
    teamId,
    targetUserId: body.userId,
  });
  setResponseStatus(event, 204);
  return null;
});
