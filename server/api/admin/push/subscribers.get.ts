import { defineEventHandler } from 'nuxt/server';

import { pushStatsService } from '~~/server/services/push/stats';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  return { items: await pushStatsService.subscribers() };
});
