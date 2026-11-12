import { defineEventHandler } from 'nuxt/server';

import { economyAccountService } from '~~/server/services/economy/accounts';

import { economyAccountParams, economyAccountPatchBody } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'economy.sharedAccounts');
  const { accountId } = parseParams(event, economyAccountParams);
  const body = await parseBody(event, economyAccountPatchBody);
  await economyAccountService.update(user.id, accountId, body);
  return economyAccountService.detail(user.id, accountId);
});
