import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { communityService } from '~~/server/services/quests/community';

import { questUuidParams } from '#shared/schemas/quests';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  await communityService.cancel(admin.id, parseParams(event, questUuidParams).id);
  setResponseStatus(event, 204);
  return null;
});
