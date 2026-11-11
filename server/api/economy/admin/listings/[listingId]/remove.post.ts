import { defineEventHandler } from 'nuxt/server';

import { economyAdminAuctionService } from '~~/server/services/economy/admin-auctions';

import { economyAdminListingRemoveBody, economyListingParams } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  const { listingId } = parseParams(event, economyListingParams);
  const { reason } = await parseBody(event, economyAdminListingRemoveBody);
  return economyAdminAuctionService.remove(admin.id, listingId, reason);
});
