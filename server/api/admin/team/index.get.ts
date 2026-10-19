import { defineEventHandler } from 'nuxt/server';

import { teamService } from '~~/server/services/team';

export default defineEventHandler(async (event) => {
  await requireAdmin(event);
  return teamService.listAdmin();
});
