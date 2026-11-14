import { defineEventHandler } from 'nuxt/server';

import { gamesplanetDealsService } from '~~/server/services/gamesplanet-deals';

import { gamesplanetSettingsBody } from '#shared/schemas/gamesplanet';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { refCode } = await parseBody(event, gamesplanetSettingsBody);
  await gamesplanetDealsService.setRefCode({ actorId: admin.id, refCode });
  return { refCode };
});
