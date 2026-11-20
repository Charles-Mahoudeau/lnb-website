import { defineEventHandler } from 'nuxt/server';

import { marketAdminService } from '~~/server/services/market/admin';

import { marketStatsQuery } from '#shared/schemas/market';

export default defineEventHandler(async (event) => {
  await requireEconomyAdmin(event);
  return marketAdminService.stats(parseQuery(event, marketStatsQuery).period);
});
