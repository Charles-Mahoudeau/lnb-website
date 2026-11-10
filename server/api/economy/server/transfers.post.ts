import { defineEventHandler } from 'nuxt/server';

import { economyServerService } from '~~/server/services/economy/server';

import { economyTransferBody } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  await requireFlag(event, 'economy.transfers');
  return economyServerService.transfer(await parseBody(event, economyTransferBody));
});
