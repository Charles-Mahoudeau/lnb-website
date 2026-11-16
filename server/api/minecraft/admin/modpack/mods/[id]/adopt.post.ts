import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { modpackCheckService } from '~~/server/services/modpack/check';

import { modpackIdParams } from '#shared/schemas/modpack';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, modpackIdParams);
  await modpackCheckService.adopt({ id, actor: { source: 'web', userId: admin.id } });
  setResponseStatus(event, 204);
  return null;
});
