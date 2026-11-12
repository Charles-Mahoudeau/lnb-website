import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { economyAuctionService } from '~~/server/services/economy/auctions';

import { economySalesSeenBody, economyUuidParams } from '#shared/schemas/economy';

// Not behind economy.auctions, like the sales it marks.
export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  const { uuid } = parseParams(event, economyUuidParams);
  await economyAuctionService.salesSeen(uuid, await parseBody(event, economySalesSeenBody));
  setResponseStatus(event, 204);
  return null;
});
