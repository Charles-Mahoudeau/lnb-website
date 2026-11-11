import { defineEventHandler } from 'nuxt/server';

import { economyAdminShopService } from '~~/server/services/economy/admin-shops';

import { economyAdminShopPatch, economyShopParams } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  const { shopId } = parseParams(event, economyShopParams);
  return economyAdminShopService.patch(
    admin.id,
    shopId,
    await parseBody(event, economyAdminShopPatch),
  );
});
