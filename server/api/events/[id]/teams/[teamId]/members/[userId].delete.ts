import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventTeamService } from '~~/server/services/events/teams';

import { eventTeamMemberParams } from '#shared/schemas/event-teams';

// Removes a player from a team. The captain only.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'events.registration');
  await requireFlag(event, 'events.teams');
  const { id, teamId, userId } = parseParams(event, eventTeamMemberParams);
  await eventTeamService.kick({ userId: user.id, eventId: id, teamId, targetUserId: userId });
  setResponseStatus(event, 204);
  return null;
});
