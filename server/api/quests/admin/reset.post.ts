import { defineEventHandler, readBody, setResponseStatus } from 'nuxt/server';

import { questAdminService } from '~~/server/services/quests/admin';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  await questAdminService.reset(admin.id, await readBody(event));
  setResponseStatus(event, 204);
  return null;
});
