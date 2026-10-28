import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { apiKeyService } from '~~/server/services/api-keys';

import { apiKeyIdParams, apiKeyRotateBody } from '#shared/schemas/api-keys';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { id } = parseParams(event, apiKeyIdParams);
  const body = await parseBody(event, apiKeyRotateBody);
  const created = await apiKeyService.rotate({ actorId: admin.id, id, body });
  setResponseStatus(event, 201);
  return created;
});
