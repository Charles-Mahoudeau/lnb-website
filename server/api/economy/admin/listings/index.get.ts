import { defineEventHandler } from 'nuxt/server';

import { economyAdminAuctionService } from '~~/server/services/economy/admin-auctions';

import { economyAdminListingsQuery } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  await requireEconomyAdmin(event);
  return economyAdminAuctionService.list(parseQuery(event, economyAdminListingsQuery));
});
