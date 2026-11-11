import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { partnerEventAdminService } from '~~/server/services/partner-events-admin';

import { partnerGameParams, partnerGameSettingsBody } from '#shared/schemas/partner-events';

export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { slug, game } = parseParams(event, partnerGameParams);
  const body = await parseBody(event, partnerGameSettingsBody);
  await partnerEventAdminService.updateGame({ actorId: manager.id, slug, game, body });
  setResponseStatus(event, 204);
  return null;
});
