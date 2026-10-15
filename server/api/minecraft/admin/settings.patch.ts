import { defineEventHandler } from 'nuxt/server';

import { modAdminService } from '~~/server/services/mods/admin';

import { modSettingsPatchBody } from '#shared/schemas/mods';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const patch = await parseBody(event, modSettingsPatchBody);
  return modAdminService.updateSettings({ patch, actor: { source: 'web', userId: admin.id } });
});
