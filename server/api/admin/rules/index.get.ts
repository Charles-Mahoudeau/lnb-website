import { defineEventHandler } from 'nuxt/server';

import { ruleService } from '~~/server/services/rules';

export default defineEventHandler(async (event) => {
  await requireWardenAdmin(event);
  return ruleService.listAdmin();
});
