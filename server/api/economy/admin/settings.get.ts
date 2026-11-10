import { defineEventHandler } from 'nuxt/server';

import { economySettingsService } from '~~/server/services/economy/settings';

export default defineEventHandler(async (event) => {
  await requireEconomyAdmin(event);
  return economySettingsService.view();
});
