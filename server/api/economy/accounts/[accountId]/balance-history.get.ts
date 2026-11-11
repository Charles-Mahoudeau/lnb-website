import { defineEventHandler } from 'nuxt/server';

import { economyAccountService } from '~~/server/services/economy/accounts';

import { economyAccountParams, economyStatsQuery } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  const user = await requireUser(event);
  await requireFlag(event, 'economy');
  const { accountId } = parseParams(event, economyAccountParams);
  const { period } = parseQuery(event, economyStatsQuery);
  return economyAccountService.balanceHistory(user.id, accountId, period);
});
