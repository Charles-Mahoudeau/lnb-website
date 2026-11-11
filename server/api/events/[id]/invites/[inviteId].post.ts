import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { eventTeamInviteService } from '~~/server/services/events/team-invites';

import { eventInviteAnswerBody, eventInviteParams } from '#shared/schemas/event-teams';

// Answers an invitation (the invited player) or a request to join (the captain).
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'events.registration');
  await requireFlag(event, 'events.teams');
  const { id, inviteId } = parseParams(event, eventInviteParams);
  const body = await parseBody(event, eventInviteAnswerBody);
  await eventTeamInviteService.answer({
    userId: user.id,
    eventId: id,
    inviteId,
    accept: body.accept,
  });
  setResponseStatus(event, 204);
  return null;
});
