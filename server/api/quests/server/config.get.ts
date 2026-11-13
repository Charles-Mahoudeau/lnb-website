import { defineEventHandler } from 'nuxt/server';

import { questServerService } from '~~/server/services/quests/server';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  await requireFlag(event, 'economy.quests');
  return questServerService.config();
});
