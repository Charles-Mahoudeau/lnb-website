import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { usersService } from '~~/server/services/users';

import { adminUserParams } from '#shared/schemas/admin';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { userId } = parseParams(event, adminUserParams);
  await usersService.remove({ actorId: admin.id, userId });
  setResponseStatus(event, 204);
  return null;
});
