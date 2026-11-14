import { defineEventHandler } from 'nuxt/server';

import { gamesplanetDealsService } from '~~/server/services/gamesplanet-deals';

import { gamesplanetSyncBody } from '#shared/schemas/gamesplanet';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { feed } = await parseBody(event, gamesplanetSyncBody);
  return gamesplanetDealsService.syncNow({ actorId: admin.id, feed });
});
