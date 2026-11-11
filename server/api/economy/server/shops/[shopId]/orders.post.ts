import { defineEventHandler } from 'nuxt/server';

import { economyShopService } from '~~/server/services/economy/shops';

import { economyShopOrderBody, economyShopParams } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  await requireFlag(event, 'economy.shops');
  const { shopId } = parseParams(event, economyShopParams);
  return economyShopService.order(shopId, await parseBody(event, economyShopOrderBody));
});
