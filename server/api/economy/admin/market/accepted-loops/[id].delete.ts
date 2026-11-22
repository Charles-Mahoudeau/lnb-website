import { defineEventHandler } from 'nuxt/server';

import { marketAdminService } from '~~/server/services/market/admin';

import { marketLoopParams } from '#shared/schemas/market';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  const { id } = parseParams(event, marketLoopParams);
  return marketAdminService.revokeLoop(admin.id, id);
});
