import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { gamesplanetDealsService } from '~~/server/services/gamesplanet-deals';

import { gamesplanetUidParams } from '#shared/schemas/gamesplanet';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { uid } = parseParams(event, gamesplanetUidParams);
  await gamesplanetDealsService.unpin({ actorId: admin.id, uid });
  setResponseStatus(event, 204);
  return null;
});
