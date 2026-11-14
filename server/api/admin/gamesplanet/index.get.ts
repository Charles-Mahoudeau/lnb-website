import { defineEventHandler } from 'nuxt/server';

import { gamesplanetDealsService } from '~~/server/services/gamesplanet-deals';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  return gamesplanetDealsService.listAdmin();
});
