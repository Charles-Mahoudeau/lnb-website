import { defineEventHandler } from 'nuxt/server';

import { economyAuctionService } from '~~/server/services/economy/auctions';

import { economyListingActionBody, economyListingParams } from '#shared/schemas/economy';

// Not behind economy.auctions: a seller can always take their item back.
export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  const { listingId } = parseParams(event, economyListingParams);
  return economyAuctionService.cancel(listingId, await parseBody(event, economyListingActionBody));
});
