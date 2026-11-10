import { defineEventHandler } from 'nuxt/server';

import { economySettingsService } from '~~/server/services/economy/settings';

import { economySettingsBody } from '#shared/schemas/economy';

export default defineEventHandler(async (event) => {
  const admin = await requireEconomyAdmin(event);
  return economySettingsService.update(admin.id, await parseBody(event, economySettingsBody));
});
