import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { partnerTeamService } from '~~/server/services/partner-teams';

import { partnerInviteParams } from '#shared/schemas/partner-events';

// The captain withdraws an invitation, or a student withdraws their request.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'partnerEvents');
  const { slug, game, inviteId } = parseParams(event, partnerInviteParams);
  await partnerTeamService.cancel({ userId: user.id, slug, game, inviteId });
  setResponseStatus(event, 204);
  return null;
});
