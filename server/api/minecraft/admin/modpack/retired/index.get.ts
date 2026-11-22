import { defineEventHandler } from 'nuxt/server';

import { modpackRetiredService } from '~~/server/services/modpack/retired';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return modpackRetiredService.list();
});
