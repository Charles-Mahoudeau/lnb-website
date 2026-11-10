import { defineEventHandler } from 'nuxt/server';

import { economyServerService } from '~~/server/services/economy/server';

import { economyHandleParams } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  return economyServerService.account(parseParams(event, economyHandleParams).handle);
});
