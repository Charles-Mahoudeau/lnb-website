import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { modRefreshService } from '~~/server/services/mods/refresh';

import { modIdParams, modRefreshBody } from '#shared/schemas/mods';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, modIdParams);
  const body = await parseBody(event, modRefreshBody);
  await modRefreshService.apply({ modId: id, body, actor: { source: 'web', userId: admin.id } });
  setResponseStatus(event, 204);
  return null;
});
