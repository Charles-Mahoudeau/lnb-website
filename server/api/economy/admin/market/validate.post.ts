import { defineEventHandler } from 'nuxt/server';

import { marketAdminService } from '~~/server/services/market/admin';

import { marketValidateBody } from '#shared/schemas/market';

export default defineEventHandler(async (event) => {
  await requireEconomyAdmin(event);
  return marketAdminService.validate(await parseBody(event, marketValidateBody));
});
