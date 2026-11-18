import { defineEventHandler } from 'nuxt/server';

import { ruleService } from '~~/server/services/rules';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  return ruleService.loadDraft({ actorId: admin.id });
});
