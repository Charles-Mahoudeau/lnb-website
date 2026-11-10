import { defineEventHandler } from 'nuxt/server';

import { economyAdminService } from '~~/server/services/economy/admin';

import { economyLedgerQuery } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  await requireEconomyAdmin(event);
  return economyAdminService.ledger(parseQuery(event, economyLedgerQuery));
});
