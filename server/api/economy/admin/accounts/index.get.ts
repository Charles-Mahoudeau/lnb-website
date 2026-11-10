import { defineEventHandler } from 'nuxt/server';

import { economyAdminService } from '~~/server/services/economy/admin';

import { economyAdminAccountsQuery } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  await requireEconomyAdmin(event);
  return economyAdminService.list(parseQuery(event, economyAdminAccountsQuery));
});
