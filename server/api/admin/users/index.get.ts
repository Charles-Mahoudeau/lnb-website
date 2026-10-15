import { defineEventHandler } from 'nuxt/server';

import { usersService } from '~~/server/services/users';

import { adminUsersQuery } from '#shared/schemas/admin';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  return usersService.list(parseQuery(event, adminUsersQuery));
});
