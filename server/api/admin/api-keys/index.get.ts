import { defineEventHandler } from 'nuxt/server';

import { apiKeyService } from '~~/server/services/api-keys';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  return apiKeyService.listAdmin();
});
