import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { partnerEventAdminService } from '~~/server/services/partner-events-admin';

import { partnerAdminTeamParams } from '#shared/schemas/partner-events';

export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { slug, teamId } = parseParams(event, partnerAdminTeamParams);
  await partnerEventAdminService.disbandTeam({ actorId: manager.id, slug, teamId });
  setResponseStatus(event, 204);
  return null;
});
