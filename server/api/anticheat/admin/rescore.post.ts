import { defineEventHandler } from 'nuxt/server';

import { anticheatAdminService } from '~~/server/services/anticheat/admin';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return { files: await anticheatAdminService.rescoreAll() };
});
