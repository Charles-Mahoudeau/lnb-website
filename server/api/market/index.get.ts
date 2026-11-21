import { defineEventHandler } from 'nuxt/server';

import { marketReadService } from '~~/server/services/market/read';

export default defineEventHandler(async (event) => {
  await requireFlag(event, 'economy.market');
  const session = await getAuthSession(event);
  return marketReadService.publicOverview(session?.user.id);
});
