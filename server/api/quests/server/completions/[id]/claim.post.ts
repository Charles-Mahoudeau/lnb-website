import { defineEventHandler, readBody } from 'nuxt/server';

import { questServerService } from '~~/server/services/quests/server';

import { questUuidParams } from '#shared/schemas/quests';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  await requireFlag(event, 'economy.quests');
  const { id } = parseParams(event, questUuidParams);
  return questServerService.claimFromServer(id, await readBody(event));
});
