import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { modpackService } from '~~/server/services/modpack';

import { modpackIdParams, modpackPinBody } from '#shared/schemas/modpack';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { id } = parseParams(event, modpackIdParams);
  const body = await parseBody(event, modpackPinBody);
  await modpackService.pinFile({ id, body, actor: { source: 'web', userId: admin.id } });
  setResponseStatus(event, 204);
  return null;
});
