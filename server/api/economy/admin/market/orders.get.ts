import { defineEventHandler } from 'nuxt/server';

import { marketAdminService } from '~~/server/services/market/admin';

import { marketOrdersQuery } from '#shared/schemas/market';

export default defineEventHandler(async (event) => {
  await requireEconomyAdmin(event);
  return marketAdminService.orders(parseQuery(event, marketOrdersQuery));
});
