import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { partnerEventAdminService } from '~~/server/services/partner-events-admin';

import { partnerAdminTeamParams, partnerTeamReferentBody } from '#shared/schemas/partner-events';

// Sets or clears the referent of one team, replacing its game's in the export.
export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { slug, teamId } = parseParams(event, partnerAdminTeamParams);
  const body = await parseBody(event, partnerTeamReferentBody);
  await partnerEventAdminService.setTeamReferent({ actorId: manager.id, slug, teamId, body });
  setResponseStatus(event, 204);
  return null;
});
