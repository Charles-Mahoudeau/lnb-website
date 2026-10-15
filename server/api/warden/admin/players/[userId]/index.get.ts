import { defineEventHandler } from 'nuxt/server';

import { wardenAdminService } from '~~/server/services/warden/admin';

import { wardenUserParams } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return wardenAdminService.player(parseParams(event, wardenUserParams).userId);
});
