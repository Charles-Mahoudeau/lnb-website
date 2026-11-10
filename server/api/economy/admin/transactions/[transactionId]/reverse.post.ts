import { defineEventHandler } from 'nuxt/server';

import { economyAdminService } from '~~/server/services/economy/admin';

import { economyReverseBody, economyTransactionParams } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  const { transactionId } = parseParams(event, economyTransactionParams);
  const { reason } = await parseBody(event, economyReverseBody);
  return economyAdminService.reverse(admin.id, transactionId, reason);
});
