import { defineEventHandler } from 'nuxt/server';

import { modListService } from '~~/server/services/mods/list';

// Public: signed-out visitors see the scores, without votes of their own.
export default defineEventHandler(async (event) => {
  const session = await getAuthSession(event);
  return modListService.page(session?.user.id);
});
