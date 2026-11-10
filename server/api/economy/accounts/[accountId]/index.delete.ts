import { defineEventHandler, setResponseStatus } from 'nuxt/server';

import { economyAccountService } from '~~/server/services/economy/accounts';

import { economyAccountParams } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'economy.sharedAccounts');
  const { accountId } = parseParams(event, economyAccountParams);
  await economyAccountService.close(user.id, accountId);
  setResponseStatus(event, 204);
  return null;
});
