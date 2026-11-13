import { defineEventHandler, readBody, setResponseStatus } from 'nuxt/server';

import { questAdminService } from '~~/server/services/quests/admin';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  setResponseStatus(event, 201);
  return questAdminService.createQuest(admin.id, await readBody(event));
});
