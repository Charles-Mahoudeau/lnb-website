import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { modpackRetiredService } from '~~/server/services/modpack/retired';

import { modpackIdParams } from '#shared/schemas/modpack';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, modpackIdParams);
  await modpackRetiredService.remove({ id, actor: { source: 'web', userId: admin.id } });
  setResponseStatus(event, 204);
  return null;
});
