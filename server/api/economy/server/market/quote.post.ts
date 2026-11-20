import { defineEventHandler } from 'nuxt/server';

import { marketOrderService } from '~~/server/services/market/orders';

import { marketQuoteBody } from '#shared/schemas/market';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  return marketOrderService.quote(await parseBody(event, marketQuoteBody));
});
