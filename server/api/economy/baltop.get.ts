import { defineEventHandler } from 'nuxt/server';

import { economyBaltopService } from '~~/server/services/economy/baltop';

// Signed-in people only: the ranking names players.
export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'economy.baltop');
  return economyBaltopService.list(user.id);
});
