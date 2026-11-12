import { defineEventHandler } from 'nuxt/server';

import { economyServerAccountService } from '~~/server/services/economy/server-accounts';

import { economyHandleParams, economyServerPlayerQuery } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  await requireFlag(event, 'economy.sharedAccounts');
  const { handle } = parseParams(event, economyHandleParams);
  const { player } = parseQuery(event, economyServerPlayerQuery);
  return economyServerAccountService.members(handle, player);
});
