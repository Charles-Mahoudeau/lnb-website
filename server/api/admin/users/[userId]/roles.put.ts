import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { usersService } from '~~/server/services/users';

import { adminRolesBody, adminUserParams } from '#shared/schemas/admin';

export default defineEventHandler(async (event) => {
  const admin = await requireAdmin(event);
  const { userId } = parseParams(event, adminUserParams);
  const roles = await parseBody(event, adminRolesBody);
  await usersService.setRoles({ actorId: admin.id, userId, roles });
  setResponseStatus(event, 204);
  return null;
});
