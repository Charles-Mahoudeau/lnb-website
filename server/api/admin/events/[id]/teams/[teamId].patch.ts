import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { adminTeamService } from '~~/server/services/events/admin-teams';

import { adminTeamParams, adminTeamPatchBody } from '#shared/schemas/event-teams';

// A manager renames a team, validates it by hand or changes its captain.
export default defineEventHandler(async (event) => {
  const actor = await requireEventsManager(event);
  const { id, teamId } = parseParams(event, adminTeamParams);
  const body = await parseBody(event, adminTeamPatchBody);
  await adminTeamService.update({ actorId: actor.id, eventId: id, teamId, body });
  setResponseStatus(event, 204);
  return null;
});
