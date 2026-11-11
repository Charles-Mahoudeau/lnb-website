import { defineEventHandler } from 'nuxt/server';

import { economyAuctionService } from '~~/server/services/economy/auctions';

import { economyUuidParams } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  return economyAuctionService.mine(parseParams(event, economyUuidParams).uuid);
});
