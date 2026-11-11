import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { partnerEventAdminService } from '~~/server/services/partner-events-admin';

import { partnerEventParams, partnerEventSettingsBody } from '#shared/schemas/partner-events';

export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { slug } = parseParams(event, partnerEventParams);
  const body = await parseBody(event, partnerEventSettingsBody);
  await partnerEventAdminService.updateSettings({ actorId: manager.id, slug, body });
  setResponseStatus(event, 204);
  return null;
});
