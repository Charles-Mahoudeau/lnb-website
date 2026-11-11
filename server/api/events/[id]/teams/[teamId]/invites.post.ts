import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventTeamInviteService } from '~~/server/services/events/team-invites';

import { eventTeamInviteBody, eventTeamParams } from '#shared/schemas/event-teams';

// The captain invites a player to the team. They are notified if they opted in.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'events.registration');
  await requireFlag(event, 'events.teams');
  const { id, teamId } = parseParams(event, eventTeamParams);
  const body = await parseBody(event, eventTeamInviteBody);
  const inviteId = await eventTeamInviteService.invite({
    userId: user.id,
    eventId: id,
    teamId,
    targetUserId: body.userId,
  });
  setResponseStatus(event, 201);
  return { id: inviteId };
});
