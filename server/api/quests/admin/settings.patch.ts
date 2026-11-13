import { defineEventHandler, readBody } from 'nuxt/server';

import { questAdminService } from '~~/server/services/quests/admin';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  return questAdminService.updateSettings(admin.id, await readBody(event));
});
