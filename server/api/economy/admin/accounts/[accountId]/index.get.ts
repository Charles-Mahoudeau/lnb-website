import { defineEventHandler } from 'nuxt/server';

import { economyAdminService } from '~~/server/services/economy/admin';

import { economyAccountParams } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  await requireEconomyAdmin(event);
  return economyAdminService.detail(parseParams(event, economyAccountParams).accountId);
});
