import { defineEventHandler } from 'nuxt/server';

import { marketOrderService } from '~~/server/services/market/orders';

import { marketOrderBody } from '#shared/schemas/market';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  return marketOrderService.order(await parseBody(event, marketOrderBody));
});
