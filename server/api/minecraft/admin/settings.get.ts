import { defineEventHandler } from 'nuxt/server';

import { modAdminService } from '~~/server/services/mods/admin';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return modAdminService.settings();
});
