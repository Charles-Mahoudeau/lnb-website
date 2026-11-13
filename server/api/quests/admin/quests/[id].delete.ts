import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { questAdminService } from '~~/server/services/quests/admin';

import { questIdParams } from '#shared/schemas/quests';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  await questAdminService.deleteQuest(admin.id, parseParams(event, questIdParams).id);
  setResponseStatus(event, 204);
  return null;
});
