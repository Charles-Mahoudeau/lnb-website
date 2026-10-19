import { defineEventHandler } from 'nuxt/server';

import { pushStatsService } from '~~/server/services/push/stats';

// Counts only, for events managers too. Who the subscribers are is admin-only.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  return pushStatsService.overview();
});
