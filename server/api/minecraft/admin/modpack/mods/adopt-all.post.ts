import { defineEventHandler } from 'nuxt/server';

import { modpackCheckService } from '~~/server/services/modpack/check';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  return modpackCheckService.adopt({ actor: { source: 'web', userId: admin.id } });
});
