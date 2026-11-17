import { defineEventHandler, readBody, setResponseStatus } from 'nuxt/server';

import { questAdminService } from '~~/server/services/quests/admin';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  const category = await questAdminService.createCategory(admin.id, await readBody(event));
  setResponseStatus(event, 201);
  return category;
});
