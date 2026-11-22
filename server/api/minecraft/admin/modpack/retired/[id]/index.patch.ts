import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { modpackRetiredService } from '~~/server/services/modpack/retired';

import { modpackIdParams, modpackRetiredPatchBody } from '#shared/schemas/modpack';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, modpackIdParams);
  const body = await parseBody(event, modpackRetiredPatchBody);
  await modpackRetiredService.edit({ id, body, actor: { source: 'web', userId: admin.id } });
  setResponseStatus(event, 204);
  return null;
});
