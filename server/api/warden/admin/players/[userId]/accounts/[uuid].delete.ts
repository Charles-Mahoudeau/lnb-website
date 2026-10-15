import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { wardenPlayerService } from '~~/server/services/warden/players';

import { wardenUserAccountParams } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { userId, uuid } = parseParams(event, wardenUserAccountParams);
  await wardenPlayerService.unlink({ userId, uuid, actor: { source: 'web', userId: admin.id } });
  setResponseStatus(event, 204);
  return null;
});
