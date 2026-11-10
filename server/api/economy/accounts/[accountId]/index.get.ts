import { defineEventHandler } from 'nuxt/server';

import { economyAccountService } from '~~/server/services/economy/accounts';

import { economyAccountParams } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'economy');
  const { accountId } = parseParams(event, economyAccountParams);
  return economyAccountService.detail(user.id, accountId);
});
