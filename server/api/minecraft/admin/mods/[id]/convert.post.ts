import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { modAdminService } from '~~/server/services/mods/admin';

import { modConvertBody, modIdParams } from '#shared/schemas/mods';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, modIdParams);
  const body = await parseBody(event, modConvertBody);
  await modAdminService.convert({ modId: id, body, actor: { source: 'web', userId: admin.id } });
  setResponseStatus(event, 204);
  return null;
});
