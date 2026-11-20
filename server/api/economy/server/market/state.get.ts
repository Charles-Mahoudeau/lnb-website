import { defineEventHandler } from 'nuxt/server';

import { marketReadService } from '~~/server/services/market/read';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  return marketReadService.state();
});
