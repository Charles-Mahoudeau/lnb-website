import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { partnerTeamService } from '~~/server/services/partner-teams';

import { partnerTeamParams } from '#shared/schemas/partner-events';

// Leaves the caller's team. Stays possible while teams are paused.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'partnerEvents');
  const { slug, game, teamId } = parseParams(event, partnerTeamParams);
  await partnerTeamService.leave({ userId: user.id, slug, game, teamId });
  setResponseStatus(event, 204);
  return null;
});
