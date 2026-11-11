import { defineEventHandler } from 'nuxt/server';

import { economyTradeService } from '~~/server/services/economy/trades';

import { economyTradeBody } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  await requireFlag(event, 'economy.trades');
  return economyTradeService.trade(await parseBody(event, economyTradeBody));
});
