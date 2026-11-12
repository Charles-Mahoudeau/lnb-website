import { defineEventHandler } from 'nuxt/server';

import { economyServerAccountService } from '~~/server/services/economy/server-accounts';

import { economyHandleParams, economyServerAccountPatchBody } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  requireWardenServer(event);
  await requireFlag(event, 'economy.serverApi');
  await requireFlag(event, 'economy.sharedAccounts');
  const { handle } = parseParams(event, economyHandleParams);
  return economyServerAccountService.update(
    handle,
    await parseBody(event, economyServerAccountPatchBody),
  );
});
