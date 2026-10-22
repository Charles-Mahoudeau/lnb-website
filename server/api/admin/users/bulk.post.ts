import { defineEventHandler } from 'nuxt/server';

import { usersService } from '~~/server/services/users';

import { adminBulkBody } from '#shared/schemas/admin';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const body = await parseBody(event, adminBulkBody);
  return usersService.bulk({ actorId: admin.id, body });
});
