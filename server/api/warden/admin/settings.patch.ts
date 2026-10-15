import { defineEventHandler } from 'nuxt/server';

import { wardenAdminService } from '~~/server/services/warden/admin';

import { wardenSettingsPatchBody } from '#shared/schemas/warden';

export default defineEventHandler(async (event) => {
  const admin = await requireWardenAdmin(event);
  const patch = await parseBody(event, wardenSettingsPatchBody);
  return wardenAdminService.updateSettings({ patch, actor: { source: 'web', userId: admin.id } });
});
