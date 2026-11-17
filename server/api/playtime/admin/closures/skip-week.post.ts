import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { playtimeAdminService } from '~~/server/services/playtime/admin';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  await playtimeAdminService.skipWeek({ source: 'web', userId: admin.id });
  setResponseStatus(event, 201);
  return playtimeAdminService.closures();
});
