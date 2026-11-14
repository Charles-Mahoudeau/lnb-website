import { defineEventHandler } from 'nuxt/server';

import { gamesplanetDealsService } from '~~/server/services/gamesplanet-deals';

import { gamesplanetSearchQuery } from '#shared/schemas/gamesplanet';

// Events managers pick the game of an evening from the cached catalog: by name, or by pasting a
// Gamesplanet or Steam link. Full admins have the same search under /api/admin/gamesplanet.
export default defineEventHandler(async (event) => {
  await requireEventsManager(event);
  const { q } = parseQuery(event, gamesplanetSearchQuery);
  return gamesplanetDealsService.search(q);
});
