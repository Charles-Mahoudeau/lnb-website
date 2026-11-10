import { defineEventHandler } from 'nuxt/server';

import { economyAccountService } from '~~/server/services/economy/accounts';

import { economyAccountParams, economyInviteBody } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'economy.sharedAccounts');
  const { accountId } = parseParams(event, economyAccountParams);
  await economyAccountService.invite(user.id, accountId, await parseBody(event, economyInviteBody));
  return economyAccountService.detail(user.id, accountId);
});
