import { defineEventHandler } from 'nuxt/server';

import { modpackService } from '~~/server/services/modpack';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return modpackService.list();
});
