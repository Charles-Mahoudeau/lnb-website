import { defineEventHandler } from 'nuxt/server';

import { playtimeAdminViewService } from '~~/server/services/playtime/admin-view';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return playtimeAdminViewService.live();
});
