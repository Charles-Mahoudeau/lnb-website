import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { gamesplanetDealsService } from '~~/server/services/gamesplanet-deals';

import { gamesplanetPinBody } from '#shared/schemas/gamesplanet';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { uid } = await parseBody(event, gamesplanetPinBody);
  await gamesplanetDealsService.pin({ actorId: admin.id, uid });
  setResponseStatus(event, 204);
  return null;
});
