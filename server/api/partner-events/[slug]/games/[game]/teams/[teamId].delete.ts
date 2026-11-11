import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { partnerTeamService } from '~~/server/services/partner-teams';

import { partnerTeamParams } from '#shared/schemas/partner-events';

// Disbands a team. The captain only.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'partnerEvents');
  const { slug, game, teamId } = parseParams(event, partnerTeamParams);
  await partnerTeamService.disband({ userId: user.id, slug, game, teamId });
  setResponseStatus(event, 204);
  return null;
});
