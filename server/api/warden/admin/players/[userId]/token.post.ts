import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { wardenPlayerService } from '~~/server/services/warden/players';

import { wardenUserParams } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { userId } = parseParams(event, wardenUserParams);
  await wardenPlayerService.rotateToken({ userId, actor: { source: 'web', userId: admin.id } });
  setResponseStatus(event, 204);
  return null;
});
