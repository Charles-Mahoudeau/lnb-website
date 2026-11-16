import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { modpackService } from '~~/server/services/modpack';

import { modpackIdParams, modpackPatchBody } from '#shared/schemas/modpack';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, modpackIdParams);
  const patch = await parseBody(event, modpackPatchBody);
  await modpackService.edit({ id, patch, actor: { source: 'web', userId: admin.id } });
  setResponseStatus(event, 204);
  return null;
});
