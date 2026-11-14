import { defineEventHandler } from 'nuxt/server';

import { gamesplanetDealsService } from '~~/server/services/gamesplanet-deals';

import { gamesplanetSearchQuery } from '#shared/schemas/gamesplanet';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const { q } = parseQuery(event, gamesplanetSearchQuery);
  return gamesplanetDealsService.search(q);
});
