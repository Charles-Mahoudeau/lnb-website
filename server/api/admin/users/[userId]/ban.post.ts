import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { usersService } from '~~/server/services/users';

import { adminBanBody, adminUserParams } from '#shared/schemas/admin';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { userId } = parseParams(event, adminUserParams);
  const ban = await parseBody(event, adminBanBody);
  await usersService.ban({ actorId: admin.id, userId, ban });
  setResponseStatus(event, 204);
  return null;
});
