import { defineEventHandler } from 'nuxt/server';

import { playtimeAdminService } from '~~/server/services/playtime/admin';

import { playtimeSettingsPatch } from '#shared/schemas/playtime';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const patch = await parseBody(event, playtimeSettingsPatch);
  await playtimeAdminService.updateSettings({ source: 'web', userId: admin.id }, patch);
  return playtimeAdminService.settings();
});
