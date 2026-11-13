import { defineEventHandler } from 'nuxt/server';

import { communityService } from '~~/server/services/quests/community';

import { questTemplateBody } from '#shared/schemas/quests';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  return communityService.saveTemplate(admin.id, await parseBody(event, questTemplateBody));
});
