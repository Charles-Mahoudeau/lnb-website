import { defineEventHandler } from 'nuxt/server';

import { marketAdminService } from '~~/server/services/market/admin';

import { marketItemParams, marketResetStockBody } from '#shared/schemas/market';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  const { id: itemId } = parseParams(event, marketItemParams);
  const { reason } = await parseBody(event, marketResetStockBody);
  return marketAdminService.resetStock(admin.id, itemId, reason);
});
