import { defineEventHandler } from 'nuxt/server';

import { economyAdminShopService } from '~~/server/services/economy/admin-shops';

import { economyAdminShopsQuery } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  await requireEconomyAdmin(event);
  return economyAdminShopService.list(parseQuery(event, economyAdminShopsQuery));
});
