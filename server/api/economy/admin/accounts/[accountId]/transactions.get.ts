import { defineEventHandler } from 'nuxt/server';

import { economyAdminService } from '~~/server/services/economy/admin';

import { economyAccountParams, economyCursorQuery } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  await requireEconomyAdmin(event);
  const { accountId } = parseParams(event, economyAccountParams);
  const { cursor } = parseQuery(event, economyCursorQuery);
  return economyAdminService.transactions(accountId, cursor);
});
