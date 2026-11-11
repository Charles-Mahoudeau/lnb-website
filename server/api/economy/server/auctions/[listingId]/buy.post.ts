import { defineEventHandler } from 'nuxt/server';

import { economyAuctionService } from '~~/server/services/economy/auctions';

import { economyListingBuyBody, economyListingParams } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  await requireFlag(event, 'economy.auctions');
  const { listingId } = parseParams(event, economyListingParams);
  return economyAuctionService.buy(listingId, await parseBody(event, economyListingBuyBody));
});
