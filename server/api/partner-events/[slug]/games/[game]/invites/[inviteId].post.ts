import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { partnerTeamService } from '~~/server/services/partner-teams';

import { partnerInviteAnswerBody, partnerInviteParams } from '#shared/schemas/partner-events';

// Answers an invitation (the invited student) or a request to join (the captain).
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'partnerEvents');
  const { slug, game, inviteId } = parseParams(event, partnerInviteParams);
  const body = await parseBody(event, partnerInviteAnswerBody);
  await partnerTeamService.answer({ userId: user.id, slug, game, inviteId, body });
  setResponseStatus(event, 204);
  return null;
});
