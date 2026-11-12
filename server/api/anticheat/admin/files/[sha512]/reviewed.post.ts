import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { anticheatAdminService } from '~~/server/services/anticheat/admin';

import { anticheatFileParams } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const { sha512 } = parseParams(event, anticheatFileParams);
  await anticheatAdminService.markReviewed({ actor: { source: 'web', userId: admin.id }, sha512 });
  setResponseStatus(event, 204);
  return null;
});
