import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { partnerTeamService } from '~~/server/services/partner-teams';

import { partnerTeamParams, partnerTeamPatchBody } from '#shared/schemas/partner-events';

// Renames a team, changes its abbreviation or switches requests. The captain only.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'partnerEvents');
  const { slug, game, teamId } = parseParams(event, partnerTeamParams);
  const body = await parseBody(event, partnerTeamPatchBody);
  await partnerTeamService.update({ userId: user.id, slug, game, teamId, body });
  setResponseStatus(event, 204);
  return null;
});
