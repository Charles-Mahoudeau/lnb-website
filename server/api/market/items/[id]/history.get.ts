import { defineEventHandler } from 'nuxt/server';

import { marketReadService } from '~~/server/services/market/read';

import { marketHistoryQuery, marketItemParams } from '#shared/schemas/market';

export default defineEventHandler(async (event) => {
  await requireFlag(event, 'economy.market');
  const { id: itemId } = parseParams(event, marketItemParams);
  return marketReadService.history(itemId, parseQuery(event, marketHistoryQuery).period);
});
