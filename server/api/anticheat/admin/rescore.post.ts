import { defineEventHandler } from 'nuxt/server';

import { anticheatAdminService } from '~~/server/services/anticheat/admin';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  return { files: await anticheatAdminService.rescoreAll({ source: 'web', userId: admin.id }) };
});
