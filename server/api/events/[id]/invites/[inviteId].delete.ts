import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventTeamInviteService } from '~~/server/services/events/team-invites';

import { eventInviteParams } from '#shared/schemas/event-teams';

// The captain withdraws an invitation, or a player withdraws their request. Nobody is notified.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'events.registration');
  const { id, inviteId } = parseParams(event, eventInviteParams);
  await eventTeamInviteService.cancel({ userId: user.id, eventId: id, inviteId });
  setResponseStatus(event, 204);
  return null;
});
