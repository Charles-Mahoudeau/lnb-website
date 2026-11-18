import { defineEventHandler } from 'nuxt/server';

import { downloadService } from '~~/server/services/downloads';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return downloadService.getAdmin();
});
