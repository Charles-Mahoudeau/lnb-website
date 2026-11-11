import { defineEventHandler } from 'nuxt/server';

import { economyShopService } from '~~/server/services/economy/shops';

import { economyShopDisableBody, economyShopParams } from '#shared/schemas/economy';

// Not behind economy.shops: a broken shop must stop selling even while shops are switched off.
export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  const { shopId } = parseParams(event, economyShopParams);
  await parseBody(event, economyShopDisableBody);
  return economyShopService.remove(shopId);
});
