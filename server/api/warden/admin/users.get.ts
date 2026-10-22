import { defineEventHandler } from 'nuxt/server';

import { wardenAdminService } from '~~/server/services/warden/admin';

import { wardenUserSearchQuery } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return wardenAdminService.searchUsers(parseQuery(event, wardenUserSearchQuery).q);
});
