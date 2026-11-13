import { defineEventHandler, readBody, setResponseStatus } from 'nuxt/server';

import { communityService } from '~~/server/services/quests/community';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  setResponseStatus(event, 201);
  return communityService.create(admin.id, await readBody(event));
});
