import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventTeamService } from '~~/server/services/events/teams';

import { eventTeamParams } from '#shared/schemas/event-teams';

// Leaves a team, until the event starts.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'events.registration');
  const { id, teamId } = parseParams(event, eventTeamParams);
  await eventTeamService.leave({ userId: user.id, eventId: id, teamId });
  setResponseStatus(event, 204);
  return null;
});
