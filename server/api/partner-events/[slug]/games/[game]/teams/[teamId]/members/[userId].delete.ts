import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { partnerTeamService } from '~~/server/services/partner-teams';

import { partnerTeamMemberParams } from '#shared/schemas/partner-events';

// The captain removes a player from the team.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'partnerEvents');
  const { slug, game, teamId, userId } = parseParams(event, partnerTeamMemberParams);
  await partnerTeamService.kick({ userId: user.id, slug, game, teamId, targetUserId: userId });
  setResponseStatus(event, 204);
  return null;
});
