import { defineEventHandler } from 'nuxt/server';

import { downloadService } from '~~/server/services/downloads';

// Public: new players download without signing in.
export default defineEventHandler(async (event) => {
  await requireFlag(event, 'downloads');
  return downloadService.getPublic();
});
