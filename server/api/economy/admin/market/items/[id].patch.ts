import { defineEventHandler } from 'nuxt/server';

import { marketAdminService } from '~~/server/services/market/admin';

import { marketItemParams, marketItemPatchBody } from '#shared/schemas/market';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  const { id: itemId } = parseParams(event, marketItemParams);
  return marketAdminService.updateItem(
    admin.id,
    itemId,
    await parseBody(event, marketItemPatchBody),
  );
});
