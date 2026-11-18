import { defineEventHandler } from 'nuxt/server';

import { mapService } from '~~/server/services/map';

// Public: the map page shows without signing in.
export default defineEventHandler(async (event) => {
  await requireFlag(event, 'map');
  return mapService.getPublic();
});
