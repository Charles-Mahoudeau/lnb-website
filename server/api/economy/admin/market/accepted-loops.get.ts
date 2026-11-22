import { defineEventHandler } from 'nuxt/server';

import { marketAdminService } from '~~/server/services/market/admin';

export default defineEventHandler(async (event) => {
  await requireEconomyAdmin(event);
  return marketAdminService.acceptedLoops();
});
