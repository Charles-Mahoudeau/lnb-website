import { defineEventHandler } from 'nuxt/server';

import { wardenPlayerService } from '~~/server/services/warden/players';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  return wardenPlayerService.me(user);
});
