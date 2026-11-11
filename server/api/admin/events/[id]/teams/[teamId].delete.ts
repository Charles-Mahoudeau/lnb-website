import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { adminTeamService } from '~~/server/services/events/admin-teams';

import { adminTeamParams } from '#shared/schemas/event-teams';

// A manager deletes a team. Its players stay registered.
export default defineEventHandler(async (event) => {
  const actor = await requireEventsManager(event);
  const { id, teamId } = parseParams(event, adminTeamParams);
  await adminTeamService.remove({ actorId: actor.id, eventId: id, teamId });
  setResponseStatus(event, 204);
  return null;
});
