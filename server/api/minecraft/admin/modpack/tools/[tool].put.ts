import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { modpackToolService } from '~~/server/services/modpack/tools';

import { modpackToolBody, modpackToolParams } from '#shared/schemas/modpack';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { tool } = parseParams(event, modpackToolParams);
  const body = await parseBody(event, modpackToolBody);
  await modpackToolService.publish({ tool, body, actor: { source: 'web', userId: admin.id } });
  setResponseStatus(event, 204);
  return null;
});
