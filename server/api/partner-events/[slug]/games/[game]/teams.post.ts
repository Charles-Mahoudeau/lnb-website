import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { partnerTeamService } from '~~/server/services/partner-teams';

import { partnerGameParams, partnerTeamCreateBody } from '#shared/schemas/partner-events';

// Creates a team with the caller as captain and first starter.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'partnerEvents');
  const { slug, game } = parseParams(event, partnerGameParams);
  const body = await parseBody(event, partnerTeamCreateBody);
  const created = await partnerTeamService.create({ userId: user.id, slug, game, body });
  setResponseStatus(event, 201);
  return created;
});
