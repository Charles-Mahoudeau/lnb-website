import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { questDailyService } from '~~/server/services/quests/daily';

import { questDailyBody } from '#shared/schemas/quests';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  await requireFlag(event, 'economy.quests');
  setResponseStatus(event, 201);
  return questDailyService.complete(await parseBody(event, questDailyBody));
});
