import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { questAdminService } from '~~/server/services/quests/admin';

import { questCategoryParams } from '#shared/schemas/quests';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  const { family, id } = parseParams(event, questCategoryParams);
  await questAdminService.deleteCategory(admin.id, family, id);
  setResponseStatus(event, 204);
  return null;
});
