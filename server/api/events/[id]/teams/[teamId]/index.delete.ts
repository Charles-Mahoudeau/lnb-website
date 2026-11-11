import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventTeamService } from '~~/server/services/events/teams';

import { eventTeamParams } from '#shared/schemas/event-teams';

// Disbands a team. Its players stay registered. The captain only.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'events.registration');
  await requireFlag(event, 'events.teams');
  const { id, teamId } = parseParams(event, eventTeamParams);
  await eventTeamService.disband({ userId: user.id, eventId: id, teamId });
  setResponseStatus(event, 204);
  return null;
});
