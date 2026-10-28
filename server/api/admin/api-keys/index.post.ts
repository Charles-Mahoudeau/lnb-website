import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { apiKeyService } from '~~/server/services/api-keys';

import { apiKeyBody } from '#shared/schemas/api-keys';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const body = await parseBody(event, apiKeyBody);
  const created = await apiKeyService.create({ actorId: admin.id, body });
  setResponseStatus(event, 201);
  return created;
});
