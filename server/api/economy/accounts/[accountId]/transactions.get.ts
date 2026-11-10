import { defineEventHandler } from 'nuxt/server';

import { economyAccountService } from '~~/server/services/economy/accounts';

import { economyAccountParams, economyCursorQuery } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'economy');
  const { accountId } = parseParams(event, economyAccountParams);
  const { cursor } = parseQuery(event, economyCursorQuery);
  return economyAccountService.transactions(user.id, accountId, cursor);
});
