import { defineEventHandler } from 'nuxt/server';

import { economyAdminService } from '~~/server/services/economy/admin';

import { economyAccountParams, economyStatsQuery } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  await requireEconomyAdmin(event);
  const { accountId } = parseParams(event, economyAccountParams);
  const { period } = parseQuery(event, economyStatsQuery);
  return economyAdminService.balanceHistory(accountId, period);
});
