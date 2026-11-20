import { defineEventHandler } from 'nuxt/server';

import { marketAdminService } from '~~/server/services/market/admin';

import { marketItemCreateBody } from '#shared/schemas/market';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  return marketAdminService.createItem(admin.id, await parseBody(event, marketItemCreateBody));
});
