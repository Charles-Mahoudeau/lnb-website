import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { adminTeamService } from '~~/server/services/events/admin-teams';

import { adminTeamMemberParams } from '#shared/schemas/event-teams';

// A manager takes a player out of a team. They stay registered.
export default defineEventHandler(async (event) => {
  const actor = await requireEventsManager(event);
  const { id, teamId, userId } = parseParams(event, adminTeamMemberParams);
  await adminTeamService.removeMember({ actorId: actor.id, eventId: id, teamId, userId });
  setResponseStatus(event, 204);
  return null;
});
