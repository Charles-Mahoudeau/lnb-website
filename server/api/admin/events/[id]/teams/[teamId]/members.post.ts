import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { adminTeamService } from '~~/server/services/events/admin-teams';

import { adminTeamParams, adminTeamMemberBody } from '#shared/schemas/event-teams';

// A manager puts a registered player in a team, past the window and the start.
export default defineEventHandler(async (event) => {
  const actor = await requireEventsManager(event);
  const { id, teamId } = parseParams(event, adminTeamParams);
  const body = await parseBody(event, adminTeamMemberBody);
  await adminTeamService.addMember({
    actorId: actor.id,
    eventId: id,
    teamId,
    userId: body.userId,
    force: body.force,
  });
  setResponseStatus(event, 204);
  return null;
});
