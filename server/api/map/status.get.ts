import { defineEventHandler } from 'nuxt/server';

import { mapService } from '~~/server/services/map';

// Public, like the map page.
export default defineEventHandler(async (event) => {
  await requireFlag(event, 'map');
  return mapService.getStatus();
});
