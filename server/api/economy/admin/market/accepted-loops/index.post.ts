import { defineEventHandler } from 'nuxt/server';

import { marketAdminService } from '~~/server/services/market/admin';

import { marketAcceptLoopBody } from '#shared/schemas/market';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  return marketAdminService.acceptLoop(admin.id, await parseBody(event, marketAcceptLoopBody));
});
