import { defineEventHandler } from 'nuxt/server';

import { economyShopService } from '~~/server/services/economy/shops';

import { economyShopSettings } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  await requireFlag(event, 'economy.shops');
  return economyShopService.create(await parseBody(event, economyShopSettings));
});
