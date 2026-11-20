import { defineEventHandler } from 'nuxt/server';

import { marketAdminService } from '~~/server/services/market/admin';

import { marketSettingsPatch } from '#shared/schemas/market';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  return marketAdminService.updateSettings(admin.id, await parseBody(event, marketSettingsPatch));
});
