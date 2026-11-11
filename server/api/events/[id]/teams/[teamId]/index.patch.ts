import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventTeamService } from '~~/server/services/events/teams';

import { eventTeamParams, eventTeamPatchBody } from '#shared/schemas/event-teams';

// Renames a team or turns requests to join on or off. The captain only.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'events.registration');
  await requireFlag(event, 'events.teams');
  const { id, teamId } = parseParams(event, eventTeamParams);
  const body = await parseBody(event, eventTeamPatchBody);
  await eventTeamService.update({ userId: user.id, eventId: id, teamId, body });
  setResponseStatus(event, 204);
  return null;
});
