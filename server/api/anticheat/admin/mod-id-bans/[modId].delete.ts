import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { anticheatAdminService } from '~~/server/services/anticheat/admin';

import { anticheatModIdParams } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { modId } = parseParams(event, anticheatModIdParams);
  await anticheatAdminService.unbanModId({ actor: { source: 'web', userId: admin.id }, modId });
  setResponseStatus(event, 204);
  return null;
});
