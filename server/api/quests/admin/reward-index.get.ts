import { defineEventHandler } from 'nuxt/server';

import { questAdminService } from '~~/server/services/quests/admin';

import { questIndexQuery } from '#shared/schemas/quests';

export default defineEventHandler(async (event) => {
  await requireEconomyAdmin(event);
  return questAdminService.indexView(parseQuery(event, questIndexQuery).days);
});
