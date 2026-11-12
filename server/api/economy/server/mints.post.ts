import { defineEventHandler } from 'nuxt/server';

import { economyServerService } from '~~/server/services/economy/server';

import { economyMintBody } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  await requireFlag(event, 'economy.mobDrops');
  return economyServerService.mint(await parseBody(event, economyMintBody));
});
