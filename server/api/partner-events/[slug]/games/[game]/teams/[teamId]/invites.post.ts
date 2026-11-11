import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { partnerTeamService } from '~~/server/services/partner-teams';

import { partnerInviteBody, partnerTeamParams } from '#shared/schemas/partner-events';

// The captain invites a student from the looking-for-a-team list.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'partnerEvents');
  const { slug, game, teamId } = parseParams(event, partnerTeamParams);
  const body = await parseBody(event, partnerInviteBody);
  const created = await partnerTeamService.invite({
    userId: user.id,
    slug,
    game,
    teamId,
    targetUserId: body.userId,
  });
  setResponseStatus(event, 201);
  return created;
});
