import { defineEventHandler } from 'nuxt/server';

import { rateLimitModeService } from '~~/server/services/rate-limit-mode';

import { rateLimitModeBody } from '#shared/schemas/rate-limit';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { mode } = await parseBody(event, rateLimitModeBody);
  await rateLimitModeService.set({ mode, actorId: admin.id });
  return await rateLimitModeService.get();
});
