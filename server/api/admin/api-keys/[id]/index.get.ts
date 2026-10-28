import { defineEventHandler } from 'nuxt/server';

import { apiKeyService } from '~~/server/services/api-keys';

import { apiKeyIdParams } from '#shared/schemas/api-keys';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  const { id } = parseParams(event, apiKeyIdParams);
  return apiKeyService.detail(id);
});
