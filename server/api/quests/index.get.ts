import { defineEventHandler } from 'nuxt/server';

import { questPublicService } from '~~/server/services/quests/public';

export default defineEventHandler(async (event) => {
  await requireFlag(event, 'economy.quests');
  const session = await getAuthSession(event);
  return questPublicService.overview({ userId: session?.user.id });
});
