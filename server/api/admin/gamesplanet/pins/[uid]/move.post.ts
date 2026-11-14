import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { gamesplanetDealsService } from '~~/server/services/gamesplanet-deals';

import { gamesplanetMoveBody, gamesplanetUidParams } from '#shared/schemas/gamesplanet';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const { uid } = parseParams(event, gamesplanetUidParams);
  const { direction } = await parseBody(event, gamesplanetMoveBody);
  await gamesplanetDealsService.movePin({ uid, direction });
  setResponseStatus(event, 204);
  return null;
});
