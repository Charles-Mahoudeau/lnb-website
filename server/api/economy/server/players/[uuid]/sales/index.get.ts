import { defineEventHandler } from 'nuxt/server';

import { economyAuctionService } from '~~/server/services/economy/auctions';

import { economyUuidParams } from '#shared/schemas/economy';

// Not behind economy.auctions: a seller is told about their sales even while the house is closed.
export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  return economyAuctionService.sales(parseParams(event, economyUuidParams).uuid);
});
