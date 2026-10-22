import { defineEventHandler } from 'nuxt/server';

import { rateLimitModeService } from '~~/server/services/rate-limit-mode';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  return await rateLimitModeService.get();
});
