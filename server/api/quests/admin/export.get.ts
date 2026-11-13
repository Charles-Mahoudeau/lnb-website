import { defineEventHandler } from 'nuxt/server';

import { questAdminService } from '~~/server/services/quests/admin';

export default defineEventHandler(async (event) => {
  await requireEconomyAdmin(event);
  return questAdminService.exportCatalog();
});
