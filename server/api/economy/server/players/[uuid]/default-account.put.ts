import { defineEventHandler } from 'nuxt/server';

import { economyServerService } from '~~/server/services/economy/server';

import { economyServerDefaultBody, economyUuidParams } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  const { uuid } = parseParams(event, economyUuidParams);
  const { account } = await parseBody(event, economyServerDefaultBody);
  return economyServerService.setDefault(uuid, account);
});
