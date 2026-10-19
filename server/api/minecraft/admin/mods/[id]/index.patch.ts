import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { modAdminService } from '~~/server/services/mods/admin';

import { modAdminPatchBody, modIdParams } from '#shared/schemas/mods';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, modIdParams);
  const patch = await parseBody(event, modAdminPatchBody);
  await modAdminService.edit({ modId: id, patch, actor: { source: 'web', userId: admin.id } });
  setResponseStatus(event, 204);
  return null;
});
