import { defineEventHandler } from 'nuxt/server';

import { playtimeAdminService } from '~~/server/services/playtime/admin';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return playtimeAdminService.closures();
});
