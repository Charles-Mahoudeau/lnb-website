import { defineEventHandler } from 'nuxt/server';

import { pushSettingsService } from '~~/server/services/push/settings';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  return pushSettingsService.get();
});
