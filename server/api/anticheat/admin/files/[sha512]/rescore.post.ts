import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { anticheatAdminService } from '~~/server/services/anticheat/admin';

import { anticheatFileParams } from '#shared/schemas/anticheat';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  const { sha512 } = parseParams(event, anticheatFileParams);
  await anticheatAdminService.rescoreFile(sha512);
  setResponseStatus(event, 204);
  return null;
});
