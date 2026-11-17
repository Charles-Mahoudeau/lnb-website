import { defineEventHandler } from 'nuxt/server';

import { modpackToolService } from '~~/server/services/modpack/tools';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return modpackToolService.list();
});
