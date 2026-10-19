import { defineEventHandler } from 'nuxt/server';

import { teamService } from '~~/server/services/team';

// Public: the team page shows without signing in.
export default defineEventHandler(async (event) => {
  await requireFlag(event, 'team');
  return teamService.listPublic();
});
