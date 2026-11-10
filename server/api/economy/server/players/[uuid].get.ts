import { defineEventHandler } from 'nuxt/server';

import { economyServerService } from '~~/server/services/economy/server';

import { economyUuidParams } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  return economyServerService.lookup(parseParams(event, economyUuidParams).uuid);
});
