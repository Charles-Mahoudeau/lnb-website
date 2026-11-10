import { defineEventHandler } from 'nuxt/server';

import { economyAdminService } from '~~/server/services/economy/admin';

// Site admins only, like the reset it comes before.
export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  return economyAdminService.exportAll();
});
