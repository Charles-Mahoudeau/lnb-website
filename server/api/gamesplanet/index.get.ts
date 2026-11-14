import { defineEventHandler } from 'nuxt/server';

import { gamesplanetDealsService } from '~~/server/services/gamesplanet-deals';

// Public: the partners page shows the deals without signing in.
export default defineEventHandler(async (event) => {
  await requireFlag(event, 'gamesplanet');
  return gamesplanetDealsService.listPublic();
});
