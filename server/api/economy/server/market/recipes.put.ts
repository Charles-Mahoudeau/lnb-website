import { defineEventHandler } from 'nuxt/server';

import { marketRecipeService } from '~~/server/services/market/recipes';

import { marketRecipeBody } from '#shared/schemas/market';

// Not behind economy.market: the server sends its recipes whether or not the Market is open.
export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  return marketRecipeService.replace(await parseBody(event, marketRecipeBody));
});
