import { defineEventHandler } from 'nuxt/server';

import { marketReadService } from '~~/server/services/market/read';

import { marketPlayerParams } from '#shared/schemas/market';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  const { uuid } = parseParams(event, marketPlayerParams);
  return marketReadService.playerWindow(uuid);
});
