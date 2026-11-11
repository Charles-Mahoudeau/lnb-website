import { defineEventHandler } from 'nuxt/server';

import { partnerEventAdminService } from '~~/server/services/partner-events-admin';

import { partnerEventParams } from '#shared/schemas/partner-events';

// Queues the push announcement, once. Ask for the impact first, to confirm it.
export default defineEventHandler(async (event) => {
  const manager = await requireEventsManager(event);
  const { slug } = parseParams(event, partnerEventParams);
  return partnerEventAdminService.announce({ actorId: manager.id, slug });
});
