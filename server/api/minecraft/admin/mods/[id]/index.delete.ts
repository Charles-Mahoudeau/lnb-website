import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { modAdminService } from '~~/server/services/mods/admin';

import { modIdParams } from '#shared/schemas/mods';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, modIdParams);
  await modAdminService.deleteOfficial({ modId: id, actor: { source: 'web', userId: admin.id } });
  setResponseStatus(event, 204);
  return null;
});
