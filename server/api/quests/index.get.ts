import { defineEventHandler } from 'nuxt/server';

import { questPublicService } from '~~/server/services/quests/public';

import { questOverviewQuery } from '#shared/schemas/quests';

export default defineEventHandler(async (event) => {
  await requireFlag(event, 'economy.quests');
  const session = await getAuthSession(event);
  const query = parseQuery(event, questOverviewQuery);
  return questPublicService.overview({ seasonNumber: query.season, userId: session?.user.id });
});
