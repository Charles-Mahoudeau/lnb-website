import { createError, defineEventHandler } from 'nuxt/server';

import { playtimeViewService } from '~~/server/services/playtime/view';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'playtime');
  const view = await playtimeViewService.me(user.id);
  if (!view) throw createError({ status: 404, statusText: 'Not Found' });
  return view;
});
