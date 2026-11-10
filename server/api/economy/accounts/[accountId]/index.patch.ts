import { defineEventHandler } from 'nuxt/server';

import { economyAccountService } from '~~/server/services/economy/accounts';

import { economyAccountParams, economyRenameBody } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'economy.sharedAccounts');
  const { accountId } = parseParams(event, economyAccountParams);
  const { name } = await parseBody(event, economyRenameBody);
  await economyAccountService.rename(user.id, accountId, name);
  return economyAccountService.detail(user.id, accountId);
});
