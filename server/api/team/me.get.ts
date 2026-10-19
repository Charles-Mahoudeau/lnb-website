import { defineEventHandler } from 'nuxt/server';

import { teamService } from '~~/server/services/team';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  return teamService.me(user.id);
});
