import { defineEventHandler } from 'nuxt/server';

import { wardenAdminService } from '~~/server/services/warden/admin';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return wardenAdminService.settings();
});
