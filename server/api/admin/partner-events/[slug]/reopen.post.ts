import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { partnerEventAdminService } from '~~/server/services/partner-events-admin';

import { partnerEventParams } from '#shared/schemas/partner-events';

export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { slug } = parseParams(event, partnerEventParams);
  await partnerEventAdminService.reopen({ actorId: manager.id, slug });
  setResponseStatus(event, 204);
  return null;
});
