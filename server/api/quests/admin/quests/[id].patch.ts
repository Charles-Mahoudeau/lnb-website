import { defineEventHandler, readBody } from 'nuxt/server';

import { questAdminService } from '~~/server/services/quests/admin';

import { questIdParams } from '#shared/schemas/quests';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  return questAdminService.updateQuest(
    admin.id,
    parseParams(event, questIdParams).id,
    await readBody(event),
  );
});
