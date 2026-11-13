import { defineEventHandler } from 'nuxt/server';

import { communityService } from '~~/server/services/quests/community';

export default defineEventHandler(async (event) => {
  await requireEconomyAdmin(event);
  const items = await communityService.list();
  return { items, templates: await communityService.templates() };
});
