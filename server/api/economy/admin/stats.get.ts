import { defineEventHandler } from 'nuxt/server';

import { economyStatsService } from '~~/server/services/economy/stats';

import { economyStatsQuery } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  await requireEconomyAdmin(event);
  const { period } = parseQuery(event, economyStatsQuery);
  return economyStatsService.stats(period);
});
