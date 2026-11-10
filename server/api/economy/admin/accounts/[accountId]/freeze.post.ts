import { defineEventHandler } from 'nuxt/server';

import { economyAdminService } from '~~/server/services/economy/admin';

import { economyAccountParams, economyFreezeBody } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  const { accountId } = parseParams(event, economyAccountParams);
  return economyAdminService.freeze(admin.id, accountId, await parseBody(event, economyFreezeBody));
});
