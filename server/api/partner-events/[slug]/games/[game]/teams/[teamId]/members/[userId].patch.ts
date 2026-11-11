import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { partnerTeamService } from '~~/server/services/partner-teams';

import { partnerMemberPatchBody, partnerTeamMemberParams } from '#shared/schemas/partner-events';

// Moves a player between starter and substitute, or hands over captaincy. The captain only.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'partnerEvents');
  const { slug, game, teamId, userId } = parseParams(event, partnerTeamMemberParams);
  const body = await parseBody(event, partnerMemberPatchBody);
  await partnerTeamService.patchMember({
    userId: user.id,
    slug,
    game,
    teamId,
    targetUserId: userId,
    body,
  });
  setResponseStatus(event, 204);
  return null;
});
