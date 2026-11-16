import { defineEventHandler } from 'nuxt/server';

import { modpackCheckService } from '~~/server/services/modpack/check';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return modpackCheckService.check();
});
