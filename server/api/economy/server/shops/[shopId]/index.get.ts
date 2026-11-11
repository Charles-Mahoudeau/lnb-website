import { defineEventHandler } from 'nuxt/server';

import { economyShopService } from '~~/server/services/economy/shops';

import { economyShopParams } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  return economyShopService.get(parseParams(event, economyShopParams).shopId);
});
