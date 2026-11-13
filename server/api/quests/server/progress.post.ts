import { defineEventHandler, readBody, setResponseStatus } from 'nuxt/server';

import { questServerService } from '~~/server/services/quests/server';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  await requireFlag(event, 'economy.quests');
  await questServerService.progress(await readBody(event));
  setResponseStatus(event, 204);
  return null;
});
