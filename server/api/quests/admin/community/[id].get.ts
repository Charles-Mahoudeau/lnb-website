import { defineEventHandler } from 'nuxt/server';

import { communityService } from '~~/server/services/quests/community';

import { questUuidParams } from '#shared/schemas/quests';

export default defineEventHandler(async (event) => {
  await requireEconomyAdmin(event);
  return {
    contributors: await communityService.topContributors(parseParams(event, questUuidParams).id),
  };
});
