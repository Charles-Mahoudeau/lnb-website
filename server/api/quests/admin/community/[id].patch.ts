import { defineEventHandler, readBody } from 'nuxt/server';

import { communityService } from '~~/server/services/quests/community';

import { questUuidParams } from '#shared/schemas/quests';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  return communityService.update(
    admin.id,
    parseParams(event, questUuidParams).id,
    await readBody(event),
  );
});
