import { defineEventHandler, readBody } from 'nuxt/server';

import { questAdminService } from '~~/server/services/quests/admin';

import { questCategoryParams } from '#shared/schemas/quests';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  const { family, id } = parseParams(event, questCategoryParams);
  return questAdminService.updateCategory(admin.id, family, id, await readBody(event));
});
