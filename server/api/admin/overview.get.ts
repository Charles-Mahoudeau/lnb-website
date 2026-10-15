import { defineEventHandler } from 'nuxt/server';

import { adminOverviewService } from '~~/server/services/admin-overview';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  return adminOverviewService.overview();
});
