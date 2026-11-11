import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { partnerTeamService } from '~~/server/services/partner-teams';

import { partnerRequestBody, partnerTeamParams } from '#shared/schemas/partner-events';

// A student asks the captain to be let in.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'partnerEvents');
  const { slug, game, teamId } = parseParams(event, partnerTeamParams);
  const body = await parseBody(event, partnerRequestBody);
  const created = await partnerTeamService.request({
    userId: user.id,
    slug,
    game,
    teamId,
    birthDate: body.birthDate,
  });
  setResponseStatus(event, 201);
  return created;
});
