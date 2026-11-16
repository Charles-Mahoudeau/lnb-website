import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { modpackService } from '~~/server/services/modpack';

import { modpackIdParams } from '#shared/schemas/modpack';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, modpackIdParams);
  await modpackService.remove({ id, actor: { source: 'web', userId: admin.id } });
  setResponseStatus(event, 204);
  return null;
});
