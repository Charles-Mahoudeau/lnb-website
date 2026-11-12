import { defineEventHandler } from 'nuxt/server';

import { economyAdminService } from '~~/server/services/economy/admin';

import { economyAccountParams, economyAdminAccountPatchBody } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  const { accountId } = parseParams(event, economyAccountParams);
  const { type } = await parseBody(event, economyAdminAccountPatchBody);
  return economyAdminService.setType(admin.id, accountId, type);
});
