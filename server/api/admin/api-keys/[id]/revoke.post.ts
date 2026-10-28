import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { apiKeyService } from '~~/server/services/api-keys';

import { apiKeyIdParams } from '#shared/schemas/api-keys';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { id } = parseParams(event, apiKeyIdParams);
  await apiKeyService.revoke({ actorId: admin.id, id });
  setResponseStatus(event, 204);
  return null;
});
