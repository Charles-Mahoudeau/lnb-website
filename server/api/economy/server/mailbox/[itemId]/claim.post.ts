import { defineEventHandler } from 'nuxt/server';

import { economyAuctionService } from '~~/server/services/economy/auctions';

import { economyListingActionBody, economyMailboxParams } from '#shared/schemas/economy';

// Not behind economy.auctions: items waiting for a player can always be collected.
export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  const { itemId } = parseParams(event, economyMailboxParams);
  return economyAuctionService.claim(itemId, await parseBody(event, economyListingActionBody));
});
