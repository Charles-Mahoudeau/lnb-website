import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventTeamInviteService } from '~~/server/services/events/team-invites';

import { eventTeamParams } from '#shared/schemas/event-teams';

// A registered player without a team asks the captain to join. At most 3 requests wait at once.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'events.registration');
  await requireFlag(event, 'events.teams');
  const { id, teamId } = parseParams(event, eventTeamParams);
  const inviteId = await eventTeamInviteService.request({ userId: user.id, eventId: id, teamId });
  setResponseStatus(event, 201);
  return { id: inviteId };
});
