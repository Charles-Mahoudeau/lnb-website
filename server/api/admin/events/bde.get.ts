import { defineEventHandler } from 'nuxt/server';

import { bdeSyncService } from '~~/server/services/events/bde';
import { flagService } from '~~/server/services/flags';

// Whether the form can offer pushing to the BDE website.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  return {
    configured: bdeSyncService.configured(),
    enabled: await flagService.isEnabled('events.bdeSync'),
  };
});
