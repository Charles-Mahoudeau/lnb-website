import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { questServerService } from '~~/server/services/quests/server';

import { questCompletionBody } from '#shared/schemas/quests';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  await requireFlag(event, 'economy.quests');
  setResponseStatus(event, 201);
  return questServerService.complete(await parseBody(event, questCompletionBody));
});
