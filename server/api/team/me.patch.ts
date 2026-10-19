import { defineEventHandler } from 'nuxt/server';

import { teamService } from '~~/server/services/team';

import { teamMePatch } from '#shared/schemas/team';

// A member hides themselves from the team page, or shows themselves again.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  const { showSelf } = await parseBody(event, teamMePatch);
  return teamService.setShowSelf(user.id, showSelf);
});
