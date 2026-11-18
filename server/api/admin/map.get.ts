import { defineEventHandler } from 'nuxt/server';

import { mapService } from '~~/server/services/map';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  return mapService.getAdmin();
});
